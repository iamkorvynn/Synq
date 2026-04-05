import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { Pool } from "pg";

import { loadApiConfig } from "./config";
import { registerHttpRoutes } from "./routes/http";
import { registerRealtimeRoutes } from "./routes/realtime";
import { DiskAttachmentBlobStorage } from "./storage/blob-storage";
import { startBackgroundJobs } from "./store/background-jobs";
import {
  MemoryRuntimeStateStorage,
  PostgresRuntimeStateStorage,
} from "./store/state-storage";
import { TrustedStore } from "./store/trusted-store";

export async function buildServer() {
  const config = loadApiConfig();
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
        censor: "[redacted]",
      },
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            remoteAddress: request.ip,
          };
        },
      },
    },
  });

  const stateStorage =
    config.storeDriver === "postgres"
      ? new PostgresRuntimeStateStorage(
          new Pool({
            connectionString:
              config.postgresUrl ??
              (() => {
                throw new Error(
                  "SYNQ_POSTGRES_URL is required when SYNQ_STORE_DRIVER=postgres.",
                );
              })(),
          }),
        )
      : new MemoryRuntimeStateStorage();
  const store = new TrustedStore(
    stateStorage,
    new DiskAttachmentBlobStorage(config.storageDir),
  );

  app.setErrorHandler((error, _request, reply) => {
    const message = error.message || "Unexpected error.";
    const statusCode =
      /Missing session|Session expired|Unauthorized/i.test(message)
        ? 401
        : /not found/i.test(message)
          ? 404
          : /invalid|expired|claimed|forbidden|rate limit/i.test(message)
            ? 400
            : 500;

    if (statusCode >= 500) {
      reply.log.error({ err: error }, "synq-api request failed");
    }

    reply.status(statusCode).send({
      error: message,
    });
  });

  await app.register(cors, {
    origin: config.corsOrigin,
  });
  await app.register(websocket);

  await registerHttpRoutes(app, store);
  await registerRealtimeRoutes(app, store);

  const stopJobs = startBackgroundJobs(store);
  app.addHook("onClose", async () => {
    stopJobs();
    await store.close();
  });

  return app;
}
