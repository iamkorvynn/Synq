import { describe, expect, it } from "vitest";

import {
  bytesToBase64String,
  createAttachmentKey,
  createAttachmentNonce,
  createPrekeyBundle,
  createSenderKeyState,
  decryptAttachmentBytes,
  decryptDirectMessage,
  decryptGroupMessage,
  encryptAttachmentBytes,
  encryptDirectMessage,
  encryptGroupMessage,
  establishSession,
  fingerprintKey,
  generateDeviceKeyPair,
  generateIdentityBundle,
  ratchetDecrypt,
  ratchetEncrypt,
  verifyPrekeyBundle,
} from "./index";

describe("crypto helpers", () => {
  it("round-trips a sealed direct message", () => {
    const sender = generateDeviceKeyPair();
    const recipient = generateDeviceKeyPair();

    const encrypted = encryptDirectMessage(
      "synq stays local-first",
      sender.secretKey,
      recipient.publicKey,
    );

    expect(
      decryptDirectMessage(
        encrypted,
        recipient.secretKey,
        sender.publicKey,
      ),
    ).toBe("synq stays local-first");
  });

  it("creates short trust fingerprints", () => {
    const device = generateDeviceKeyPair();

    expect(fingerprintKey(device.publicKey)).toHaveLength(16);
  });

  it("verifies a signed prekey bundle and ratchets a session", async () => {
    const alice = generateIdentityBundle();
    const bob = generateIdentityBundle();
    const bobBundle = createPrekeyBundle(bob);

    expect(verifyPrekeyBundle(bobBundle)).toBe(true);

    const aliceSession = await establishSession(alice.device.secretKey, bobBundle);
    const bobSession = {
      ...aliceSession,
      sendingChainKey: aliceSession.receivingChainKey,
      receivingChainKey: aliceSession.sendingChainKey,
    };

    const encrypted = await ratchetEncrypt(aliceSession, "forward secure-ish");
    const decrypted = await ratchetDecrypt(bobSession, encrypted.message);

    expect(decrypted.plaintext).toBe("forward secure-ish");
  });

  it("round-trips a sender-key group message", () => {
    const senderKey = createSenderKeyState("user_me");
    const encrypted = encryptGroupMessage(senderKey, "group payload");

    expect(decryptGroupMessage(senderKey, encrypted)).toBe("group payload");
  });

  it("round-trips encrypted attachment bytes", () => {
    const secret = createAttachmentKey();
    const nonce = createAttachmentNonce();
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encrypted = encryptAttachmentBytes(payload, secret, nonce);

    expect(
      bytesToBase64String(decryptAttachmentBytes(encrypted, secret, nonce)),
    ).toBe(bytesToBase64String(payload));
  });
});
