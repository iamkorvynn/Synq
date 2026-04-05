import type { FastifyInstance } from "fastify";

import {
  RealtimeEnvelopeSchema,
  SendMessageRequestSchema,
} from "@synq/protocol";
import { z } from "zod";

import type { TrustedStore } from "../store/trusted-store";

function getAuthHeader(headers: Record<string, unknown>, accessToken?: string) {
  if (accessToken) {
    return `Bearer ${accessToken}`;
  }
  const value = headers.authorization;
  return typeof value === "string" ? value : undefined;
}

export async function registerRealtimeRoutes(
  app: FastifyInstance,
  store: TrustedStore,
) {
  app.get("/realtime", { websocket: true }, (socket, request) => {
    void (async () => {
      const query = z
        .object({
          accessToken: z.string().optional(),
        })
        .parse(request.query);
      const authorization = getAuthHeader(request.headers, query.accessToken);
      let session;

      try {
        session = (await store.bootstrap(authorization)).activeSession;
      } catch {
        socket.send(
          JSON.stringify({
            type: "session.ready",
            payload: {
              error: "Unauthorized",
            },
          }),
        );
        socket.close();
        return;
      }

      const send = (payload: unknown) => {
        socket.send(JSON.stringify(payload));
      };

      send({
        type: "session.ready",
        payload: {
          at: new Date().toISOString(),
          pendingApproval: session.pendingApproval,
        },
      });

      const unsubscribe = store.onRealtime((event) => send(event));

      socket.on("message", (rawMessage) => {
        void (async () => {
          const envelope = RealtimeEnvelopeSchema.parse(
            JSON.parse(rawMessage.toString()),
          );

          if (envelope.type === "typing.update") {
            store.publish(envelope);
            return;
          }

          if (envelope.type === "message.send") {
            const message = SendMessageRequestSchema.parse(envelope.payload);
            await store.sendMessage(authorization, message);
            return;
          }

          if (envelope.type === "message.read") {
            const payload = z
              .object({
                conversationId: z.string(),
                userId: z.string(),
              })
              .parse(envelope.payload);

            store.publish({
              type: "message.read",
              payload,
            });
          }
        })().catch(() => {
          socket.send(
            JSON.stringify({
              type: "session.ready",
              payload: {
                error: "Realtime event rejected",
              },
            }),
          );
        });
      });

      socket.on("close", () => {
        unsubscribe();
      });
    })();
  });
}
