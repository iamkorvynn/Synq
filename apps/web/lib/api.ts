"use client";

import type {
  AccountDeleteRequest,
  AIActionRequest,
  ConversationCreateRequest,
  ConversationJoinRequest,
  ConversationTypingRequest,
  Device,
  DeviceApprovalRequest,
  DeviceLabelUpdateRequest,
  DeviceRevokeRequest,
  DirectConversationRequest,
  MessageEnvelope,
  MessagePinRequest,
  MessageReactionRequest,
  MessageUpdateRequest,
  ProfileUpdateRequest,
  RealtimeEnvelope,
  ReportCreateRequest,
  SynqBootstrapState,
  AttachmentFinalizeRequest,
  AttachmentSignRequest,
  AttachmentUploadRequest,
  OnboardingRequest,
  SendMessageRequest,
} from "@synq/protocol";

export type AuthDebugState = {
  ok: boolean;
  configured: {
    authSecret: boolean;
    googleClientId: boolean;
    googleClientSecret: boolean;
    postgresUrl: boolean;
  };
  sources: {
    activeGoogleSource: "authjs" | "legacy" | "missing";
    authSecretSource: string;
  };
  consistency: {
    googleIdsMatch: boolean | null;
    googleSecretsMatch: boolean | null;
    authSecretsMatch: boolean | null;
    authGooglePairReady: boolean;
    legacyGooglePairReady: boolean;
  };
  hints: string[];
  session: {
    email: string;
    name: string;
  } | null;
};

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

export async function fetchAuthDebug() {
  const endpoint = `${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/auth/debug`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Auth debug unavailable");
    }

    return (await response.json()) as AuthDebugState;
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

export async function renameDevice(payload: DeviceLabelUpdateRequest) {
  return request<Device>("/devices/label", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

export async function updateProfile(payload: ProfileUpdateRequest) {
  return request("/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createConversation(payload: ConversationCreateRequest) {
  return request("/conversations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function joinConversation(payload: ConversationJoinRequest) {
  return request("/conversations/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function startDirectConversation(payload: DirectConversationRequest) {
  return request("/conversations/direct", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markConversationRead(conversationId: string) {
  return request(`/conversations/${conversationId}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function updateTyping(
  conversationId: string,
  payload: ConversationTypingRequest,
) {
  return request(`/conversations/${conversationId}/typing`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function findContacts(query: string) {
  const search = new URLSearchParams({ query }).toString();
  return request(`/discovery/contacts?${search}`);
}

export async function reactToMessage(
  messageId: string,
  payload: MessageReactionRequest,
) {
  return request(`/messages/${messageId}/react`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pinMessage(
  messageId: string,
  payload: MessagePinRequest,
) {
  return request(`/messages/${messageId}/pin`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function editMessage(
  messageId: string,
  payload: MessageUpdateRequest,
) {
  return request(`/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteMessage(messageId: string) {
  return request(`/messages/${messageId}`, {
    method: "DELETE",
  });
}

export async function blockUser(userId: string) {
  return request(`/users/${userId}/block`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function reportMessage(
  messageId: string,
  payload: ReportCreateRequest,
) {
  return request(`/messages/${messageId}/report`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteAccount(payload: AccountDeleteRequest) {
  return request("/account", {
    method: "DELETE",
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
