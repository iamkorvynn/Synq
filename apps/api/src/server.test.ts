import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "./server";

async function authenticate(app: Awaited<ReturnType<typeof buildServer>>) {
  const challenge = await app.inject({
    method: "POST",
    url: "/auth/passkey/challenge",
    payload: {
      mode: "authenticate",
      scope: "web",
      label: "Studio Mac",
    },
  });

  const verified = await app.inject({
    method: "POST",
    url: "/auth/passkey/verify",
    payload: {
      challengeId: challenge.json().id,
      mode: "authenticate",
      scope: "web",
      label: "Studio Mac",
      credentialId: "cred_me_mac",
      publicKey: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
    },
  });

  return verified.json().session.accessToken as string;
}

describe("synq api", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the authenticated bootstrap payload", async () => {
    const accessToken = await authenticate(app);
    const response = await app.inject({
      method: "GET",
      url: "/bootstrap",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().workspaces).toHaveLength(2);
    expect(response.json().activeSession.accessToken).toBe(accessToken);
  });

  it("creates and finalizes encrypted attachments", async () => {
    const accessToken = await authenticate(app);
    const encryptedPayload = Buffer.from("sealed attachment").toString("base64");
    const signed = await app.inject({
      method: "POST",
      url: "/attachments/sign",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        fileName: "signal.mp4",
        mimeType: "video/mp4",
        size: 1024,
      },
    });

    expect(signed.statusCode).toBe(200);
    expect(signed.json().secret).toBeTruthy();

    const uploaded = await app.inject({
      method: "POST",
      url: `/attachments/${signed.json().attachmentId}/upload`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        encryptedBodyBase64: encryptedPayload,
      },
    });

    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().status).toBe("uploaded");

    const finalized = await app.inject({
      method: "POST",
      url: "/attachments/finalize",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        attachmentId: signed.json().attachmentId,
        keyId: signed.json().keyId,
        encryptedUrl: signed.json().encryptedUrl,
      },
    });

    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().status).toBe("committed");

    await app.inject({
      method: "POST",
      url: "/conversations/conv_creator/messages",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        conversationId: "conv_creator",
        ciphertext: "managed:test",
        preview: "Attachment attached",
        messageProtection: "managed_plaintext",
        mentions: [],
        attachments: [
          {
            id: signed.json().attachmentId,
            name: "signal.mp4",
            mimeType: "video/mp4",
            size: 1024,
            keyId: signed.json().keyId,
            nonce: signed.json().nonce,
            status: "committed",
            encryptedUrl: signed.json().encryptedUrl,
          },
        ],
      },
    });

    const downloaded = await app.inject({
      method: "GET",
      url: `/attachments/${signed.json().attachmentId}/content`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.body).toBe("sealed attachment");
  });

  it("rejects cloud ai for sealed rooms", async () => {
    const accessToken = await authenticate(app);
    const response = await app.inject({
      method: "POST",
      url: "/ai/actions",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        conversationId: "conv_dm_arya",
        action: "summarize",
        policy: "ephemeral_cloud",
        input: "hello",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Cloud AI is forbidden/);
  });
});
