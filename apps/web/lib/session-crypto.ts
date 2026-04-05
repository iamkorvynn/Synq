"use client";

import {
  createPrekeyBundle,
  encryptDirectMessage,
  generateIdentityBundle,
  type IdentityBundle,
} from "@synq/crypto";

const SESSION_KEY = "synq-session-device";

export function getSessionDevice(): IdentityBundle {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) {
      return JSON.parse(existing) as IdentityBundle;
    }
  } catch {}

  const generated = generateIdentityBundle();
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(generated));
  } catch {}

  return generated;
}

export function getLocalPrekeyBundle() {
  return createPrekeyBundle(getSessionDevice());
}

export function sealPreviewForRecipient(
  plaintext: string,
  recipientPublicKey: string,
) {
  const session = getSessionDevice();
  return {
    ...encryptDirectMessage(plaintext, session.device.secretKey, recipientPublicKey),
    senderPublicKey: session.device.publicKey,
  };
}
