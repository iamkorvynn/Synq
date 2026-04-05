"use client";

import type {
  AIActionRequest,
  AttachmentFinalizeRequest,
  AttachmentSignRequest,
  AttachmentUploadRequest,
  Device,
  DeviceApprovalRequest,
  DeviceRevokeRequest,
  MessageEnvelope,
  OnboardingRequest,
  PasskeyChallenge,
  PasskeyChallengeRequest,
  PasskeyVerifyRequest,
  PasskeyVerifyResponse,
  RealtimeEnvelope,
  SendMessageRequest,
  Session,
  SynqBootstrapState,
} from "@synq/protocol";

import {
  clearStoredSession,
  getAccessToken,
  getRefreshToken,
  setStoredSession,
} from "./auth-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(
  path: string,
  init?: RequestInit,
  retryOnUnauthorized = true,
): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearStoredSession();
      throw new Error(`Unauthorized for ${path}`);
    }

    const refreshed = await fetch(`${API_URL}/auth/session/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshed.ok) {
      clearStoredSession();
      throw new Error(`Unauthorized for ${path}`);
    }

    const session = (await refreshed.json()) as Session;
    setStoredSession(session);
    return request<T>(path, init, false);
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return (await response.json()) as T;
}

export async function fetchBootstrap() {
  try {
    return await request<SynqBootstrapState>("/bootstrap");
  } catch {
    return null;
  }
}

export async function fetchMessages(conversationId: string) {
  try {
    return await request<MessageEnvelope[]>(
      `/conversations/${conversationId}/messages`,
    );
  } catch {
    return [];
  }
}

export async function sendMessage(payload: SendMessageRequest) {
  return request<MessageEnvelope>(
    `/conversations/${payload.conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function runAIAction(payload: AIActionRequest) {
  return request<{ mode: string; result: string }>("/ai/actions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createPasskeyChallenge(
  payload: PasskeyChallengeRequest,
) {
  return request<PasskeyChallenge>("/auth/passkey/challenge", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyPasskey(payload: PasskeyVerifyRequest) {
  return request<PasskeyVerifyResponse>("/auth/passkey/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function completeOnboarding(payload: OnboardingRequest) {
  return request("/auth/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listDevices() {
  return request<Device[]>("/auth/devices");
}

export async function approveDevice(payload: DeviceApprovalRequest) {
  return request<Device>("/devices/approve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeDevice(payload: DeviceRevokeRequest) {
  return request<Device>("/devices/revoke", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function signAttachment(payload: AttachmentSignRequest) {
  return request<{
    attachmentId: string;
    keyId: string;
    uploadUrl: string;
    encryptedUrl: string;
    nonce: string;
    secret: string;
    status: string;
  }>("/attachments/sign", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function finalizeAttachment(payload: AttachmentFinalizeRequest) {
  return request("/attachments/finalize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadAttachmentContent(
  attachmentId: string,
  payload: AttachmentUploadRequest,
) {
  return request<{
    attachmentId: string;
    status: string;
    byteLength: number;
    sha256: string;
  }>(`/attachments/${attachmentId}/upload`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function connectRealtime(
  onEvent: (event: RealtimeEnvelope) => void,
  onOpen?: () => void,
) {
  const accessToken = getAccessToken();
  const socket = new WebSocket(
    `${API_URL.replace(/^http/, "ws")}/realtime?accessToken=${encodeURIComponent(accessToken ?? "")}`,
  );

  socket.addEventListener("open", () => {
    onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data) as RealtimeEnvelope;
    onEvent(payload);
  });

  return socket;
}
