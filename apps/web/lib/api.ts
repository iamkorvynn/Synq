"use client";

import type {
  AIActionRequest,
  Device,
  DeviceApprovalRequest,
  DeviceRevokeRequest,
  MessageEnvelope,
  RealtimeEnvelope,
  SynqBootstrapState,
  AttachmentFinalizeRequest,
  AttachmentSignRequest,
  AttachmentUploadRequest,
  OnboardingRequest,
  SendMessageRequest,
} from "@synq/protocol";

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "/api/synq";
}

function buildHttpUrl(path: string) {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildHttpUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    credentials: "include",
  });

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

export async function completeOnboarding(payload: OnboardingRequest) {
  return request("/onboarding", {
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
  queueMicrotask(() => {
    onOpen?.();
    onEvent({
      type: "session.ready",
      payload: {
        pendingApproval: false,
      },
    });
  });

  return {
    close() {},
  } as Pick<WebSocket, "close">;
}
