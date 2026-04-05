import type { FastifyInstance } from "fastify";

import {
  AIActionRequestSchema,
  AttachmentFinalizeRequestSchema,
  AttachmentSignRequestSchema,
  AttachmentUploadRequestSchema,
  ChannelCreateRequestSchema,
  ConversationCreateRequestSchema,
  DeviceApprovalRequestSchema,
  DeviceRegistrationRequestSchema,
  DeviceRevokeRequestSchema,
  DiscoveryQuerySchema,
  HandleClaimRequestSchema,
  OnboardingRequestSchema,
  PasskeyChallengeRequestSchema,
  PasskeyVerifyRequestSchema,
  SendMessageRequestSchema,
  SessionRefreshRequestSchema,
  WorkspaceCreateRequestSchema,
} from "@synq/protocol";
import { z } from "zod";

import { RateLimiter } from "../security/rate-limiter";
import type { TrustedStore } from "../store/trusted-store";

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input);
}

function getAuthHeader(headers: Record<string, unknown>) {
  const value = headers.authorization;
  return typeof value === "string" ? value : undefined;
}

export async function registerHttpRoutes(
  app: FastifyInstance,
  store: TrustedStore,
) {
  const limiter = new RateLimiter();

  app.get("/health", async () => ({
    ok: true,
    service: "synq-api",
    at: new Date().toISOString(),
  }));

  app.get("/ready", async () => store.health());

  app.get("/bootstrap", async (request) =>
    await store.bootstrap(getAuthHeader(request.headers)),
  );

  app.post("/auth/passkey/challenge", async (request) => {
    limiter.assertWithinLimit(`challenge:${request.ip}`, 8, 60_000);
    return await store.createPasskeyChallenge(
      parseOrThrow(PasskeyChallengeRequestSchema, request.body),
    );
  });

  app.post("/auth/passkey/verify", async (request) => {
    limiter.assertWithinLimit(`verify:${request.ip}`, 8, 60_000);
    return await store.verifyPasskey(
      parseOrThrow(PasskeyVerifyRequestSchema, request.body),
    );
  });

  app.post("/auth/session/refresh", async (request) =>
    await store.refreshSession(
      parseOrThrow(SessionRefreshRequestSchema, request.body),
    ),
  );

  app.post("/auth/onboarding", async (request) =>
    await store.completeOnboarding(
      getAuthHeader(request.headers),
      parseOrThrow(OnboardingRequestSchema, request.body),
    ),
  );

  app.get("/auth/devices", async (request) =>
    await store.listDevices(getAuthHeader(request.headers)),
  );
  app.post("/auth/devices", async (request) =>
    await store.registerDevice(
      getAuthHeader(request.headers),
      parseOrThrow(DeviceRegistrationRequestSchema, request.body),
    ),
  );

  app.post("/devices/approve", async (request) =>
    await store.approveDevice(
      getAuthHeader(request.headers),
      parseOrThrow(DeviceApprovalRequestSchema, request.body),
    ),
  );

  app.post("/devices/revoke", async (request) =>
    await store.revokeDevice(
      getAuthHeader(request.headers),
      parseOrThrow(DeviceRevokeRequestSchema, request.body),
    ),
  );

  app.get("/identity/handles", async (request) => {
    const bootstrap = await store.bootstrap(getAuthHeader(request.headers));
    return bootstrap.users.map(({ id, handle, name }) => ({ id, handle, name }));
  });
  app.post("/identity/handles", async (request) =>
    await store.claimHandle(
      getAuthHeader(request.headers),
      parseOrThrow(HandleClaimRequestSchema, request.body),
    ),
  );

  app.get("/workspaces", async (request) =>
    await store.listWorkspaces(getAuthHeader(request.headers)),
  );
  app.post("/workspaces", async (request) =>
    await store.createWorkspace(
      getAuthHeader(request.headers),
      parseOrThrow(WorkspaceCreateRequestSchema, request.body),
    ),
  );

  app.get("/conversations", async (request) =>
    await store.listConversations(getAuthHeader(request.headers)),
  );
  app.post("/conversations", async (request) =>
    await store.createConversation(
      getAuthHeader(request.headers),
      parseOrThrow(ConversationCreateRequestSchema, request.body),
    ),
  );

  app.get("/conversations/:conversationId/messages", async (request) => {
    const params = z
      .object({ conversationId: z.string() })
      .parse(request.params);
    return await store.listMessages(
      getAuthHeader(request.headers),
      params.conversationId,
    );
  });
  app.post("/conversations/:conversationId/messages", async (request) => {
    limiter.assertWithinLimit(`message:${request.ip}`, 30, 60_000);
    return await store.sendMessage(
      getAuthHeader(request.headers),
      parseOrThrow(SendMessageRequestSchema, request.body),
    );
  });

  app.get("/channels", async (request) =>
    await store.listChannels(getAuthHeader(request.headers)),
  );
  app.post("/channels", async (request) =>
    await store.createChannel(
      getAuthHeader(request.headers),
      parseOrThrow(ChannelCreateRequestSchema, request.body),
    ),
  );

  app.post("/attachments/sign", async (request) =>
    await store.signAttachment(
      getAuthHeader(request.headers),
      parseOrThrow(AttachmentSignRequestSchema, request.body),
    ),
  );
  app.post("/attachments/:attachmentId/upload", async (request) => {
    const params = z.object({ attachmentId: z.string() }).parse(request.params);
    return await store.uploadAttachment(
      getAuthHeader(request.headers),
      params.attachmentId,
      parseOrThrow(AttachmentUploadRequestSchema, request.body),
    );
  });
  app.post("/attachments/finalize", async (request) =>
    await store.finalizeAttachment(
      getAuthHeader(request.headers),
      parseOrThrow(AttachmentFinalizeRequestSchema, request.body),
    ),
  );
  app.get("/attachments/:attachmentId/content", async (request, reply) => {
    const params = z.object({ attachmentId: z.string() }).parse(request.params);
    const { attachment, payload } = await store.downloadAttachment(
      getAuthHeader(request.headers),
      params.attachmentId,
    );

    reply
      .type(attachment.mimeType)
      .header("content-length", payload.byteLength)
      .header(
        "content-disposition",
        `attachment; filename="${attachment.name}"`,
      );
    return reply.send(Buffer.from(payload));
  });

  app.post("/ai/actions", async (request) => {
    limiter.assertWithinLimit(`ai:${request.ip}`, 20, 60_000);
    return await store.aiAction(
      getAuthHeader(request.headers),
      parseOrThrow(AIActionRequestSchema, request.body),
    );
  });

  app.get("/discovery/contacts", async (request) => {
    const query = parseOrThrow(DiscoveryQuerySchema, request.query);
    return await store.discoverContacts(
      getAuthHeader(request.headers),
      query.query,
    );
  });
}
