"use client";

import type {
  PasskeyMode,
  PasskeyVerifyResponse,
  SessionScope,
} from "@synq/protocol";

import {
  createPasskeyChallenge,
  verifyPasskey,
} from "./api";
import { storeCredential } from "./auth-session";

const DEMO_TRUSTED_DEVICE = {
  credentialId: "cred_me_mac",
  publicKey: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
  label: "Studio Mac",
};

function bytesToBase64(input: Uint8Array) {
  return btoa(String.fromCharCode(...input));
}

function generateCredentialMaterial(label: string) {
  const random = new Uint8Array(32);
  window.crypto.getRandomValues(random);

  return {
    credentialId: `cred_${window.crypto.randomUUID()}`,
    publicKey: bytesToBase64(random),
    label,
  };
}

async function performLocalCeremony(mode: PasskeyMode, label: string) {
  if (mode === "authenticate" && label === DEMO_TRUSTED_DEVICE.label) {
    return DEMO_TRUSTED_DEVICE;
  }

  return generateCredentialMaterial(label);
}

export async function runPasskeyFlow(
  mode: PasskeyMode,
  label: string,
  scope: SessionScope = "web",
): Promise<PasskeyVerifyResponse> {
  const challenge = await createPasskeyChallenge({
    mode,
    scope,
    label,
  });
  const credential = await performLocalCeremony(mode, label);
  const verified = await verifyPasskey({
    challengeId: challenge.id,
    mode,
    label,
    credentialId: credential.credentialId,
    publicKey: credential.publicKey,
    scope,
  });

  storeCredential(credential);
  return verified;
}
