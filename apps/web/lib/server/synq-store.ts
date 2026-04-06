import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  createAttachmentKey,
  createAttachmentNonce,
  fingerprintKey,
  generateDeviceKeyPair,
} from "@synq/crypto";
import {
  AccountDeleteRequestSchema,
  BlockUserRequestSchema,
  ConversationCreateRequestSchema,
  AttachmentFinalizeRequestSchema,
  AttachmentSignRequestSchema,
  AttachmentUploadRequestSchema,
  ConversationJoinRequestSchema,
  ConversationTypingRequestSchema,
  ConversationSchema,
  DeviceLabelUpdateRequestSchema,
  DirectConversationRequestSchema,
  MessagePinRequestSchema,
  MessageReactionRequestSchema,
  MessageEnvelopeSchema,
  MessageUpdateRequestSchema,
  OnboardingRequestSchema,
  ProfileUpdateRequestSchema,
  ReportCreateRequestSchema,
  SendMessageRequestSchema,
  type AccountDeleteRequest,
  type AttachmentFinalizeRequest,
  type AttachmentObject,
  type AttachmentSignRequest,
  type AttachmentUploadRequest,
  type BlockUserRequest,
  type Channel,
  type Conversation,
  type ConversationCreateRequest,
  type ConversationJoinRequest,
  type ConversationMembership,
  type ConversationTypingRequest,
  type Device,
  type DeviceLabelUpdateRequest,
  type DirectConversationRequest,
  type MessageEnvelope,
  type ModerationLog,
  type OnboardingRequest,
  type PinnedMessage,
  type ProfileUpdateRequest,
  type ReportCreateRequest,
  type ReportRecord,
  type SynqBootstrapState,
  type TypingIndicator,
  type User,
  SynqBootstrapStateSchema,
} from "@synq/protocol";
import { Pool } from "pg";

interface ViewerIdentity {
  email: string;
  name: string;
  image?: string | null;
}

interface AttachmentBlob {
  encryptedBodyBase64: string;
  sha256: string;
}

declare global {
  var __synqSharedState: SynqBootstrapState | undefined;
  var __synqSharedBlobs: Map<string, AttachmentBlob> | undefined;
}

const STORE_ROW_ID = "global";
const DEFAULT_WORKSPACE_ID = "ws_synq";
const DEFAULT_BROADCAST_ID = "ws_ghost";
const DEFAULT_GROUP_ID = "conv_group_core";
const DEFAULT_ROOM_ID = "conv_workspace_launch";
const DEFAULT_CHANNEL_ID = "conv_creator";
const POSTGRES_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
const SEEDED_USER_IDS = new Set(["user_me", "user_arya", "user_kai"]);
const SEEDED_HANDLES = new Set(["numa.ghost", "arya.sol", "kai.vale"]);
const SEEDED_DEVICE_IDS = new Set(["dev_01", "dev_02", "dev_03", "dev_pending_me"]);
const SEEDED_CONVERSATION_IDS = new Set(["conv_dm_arya"]);
const SEEDED_RECOVERY_VALUES = new Set(["numa@synq.local", "+91-00000-00000"]);
const GLOBAL_CONVERSATION_IDS = new Set([
  DEFAULT_GROUP_ID,
  DEFAULT_ROOM_ID,
  DEFAULT_CHANNEL_ID,
]);
const LEGACY_IMPLICIT_DM_TITLE = "Direct signal";
const LEGACY_IMPLICIT_DM_SUBTITLE = "Invite-only room";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeHandle(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".")
    .slice(0, 24);
}

function baseHandleCandidate(email: string, name: string) {
  const fromName = sanitizeHandle(name);
  if (fromName.length >= 3) {
    return fromName;
  }

  const fromEmail = sanitizeHandle(email.split("@")[0] ?? "friend");
  return fromEmail.length >= 3 ? fromEmail : `friend.${randomUUID().slice(0, 6)}`;
}

function nextAvailableHandle(state: SynqBootstrapState, base: string, excludeUserId?: string) {
  const existing = new Set(
    state.users
      .filter((user) => user.id !== excludeUserId)
      .map((user) => user.handle.toLowerCase()),
  );

  let attempt = base.slice(0, 24);
  let suffix = 1;

  while (!attempt || attempt.length < 3 || existing.has(attempt)) {
    const next = `${base}.${suffix}`;
    attempt = next.slice(0, 24);
    suffix += 1;
  }

  return attempt;
}

function buildDmId(a: string, b: string) {
  return `conv_dm_${[a, b].sort().join("_")}`;
}

function makeJoinCode() {
  return randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
}

function createSessionDevice(userId: string): Device {
  const keyPair = generateDeviceKeyPair();

  return {
    id: `dev_${userId}`,
    userId,
    label: "Google browser session",
    publicKey: keyPair.publicKey,
    passkeyEnabled: false,
    trustState: "approved",
    approvedAt: nowIso(),
    lastSeenAt: nowIso(),
    credentialId: undefined,
    fingerprint: fingerprintKey(keyPair.publicKey),
  };
}

function createSharedSeedState() {
  const issuedAt = nowIso();
  const placeholderUserId = "bootstrap";
  const placeholderDeviceId = "bootstrap_device";
  const channels: Channel[] = [
    {
      id: "channel_ops",
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: "ops-room",
      purpose: "Daily coordination, secure check-ins, and incident follow-up.",
      kind: "workspace_room",
      visibility: "managed_private",
      unreadCount: 0,
    },
    {
      id: "channel_stage",
      workspaceId: DEFAULT_BROADCAST_ID,
      name: "team-updates",
      purpose: "Leadership updates, drills, and policy notices.",
      kind: "creator_channel",
      visibility: "managed_broadcast",
      unreadCount: 0,
    },
  ];

  return SynqBootstrapStateSchema.parse({
    currentUserId: placeholderUserId,
    currentDeviceId: placeholderDeviceId,
    activeSession: {
      id: "bootstrap_session",
      userId: placeholderUserId,
      deviceId: placeholderDeviceId,
      scope: "web",
      accessToken: "bootstrap_access",
      refreshToken: "bootstrap_refresh",
      issuedAt,
      expiresAt: issuedAt,
      refreshExpiresAt: issuedAt,
      pendingApproval: false,
    },
    users: [],
    recoveryMethods: [],
    devices: [],
    passkeys: [],
    deviceApprovals: [],
    workspacePolicies: [
      {
        id: "policy_synq",
        workspaceId: DEFAULT_WORKSPACE_ID,
        inviteOnly: false,
        retentionDays: 90,
      },
      {
        id: "policy_ghost",
        workspaceId: DEFAULT_BROADCAST_ID,
        inviteOnly: false,
        retentionDays: 365,
      },
    ],
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: "Synq Ops",
        slug: "synq-ops",
        description: "High-trust workspace for protected team coordination.",
        ambientScene: "Aurora Vault",
        memberCount: 0,
        policyId: "policy_synq",
      },
      {
        id: DEFAULT_BROADCAST_ID,
        name: "Leadership Updates",
        slug: "leadership-updates",
        description: "Announcements, drills, and policy notices for trusted teams.",
        ambientScene: "Coral Drift",
        memberCount: 0,
        policyId: "policy_ghost",
      },
    ],
    circles: [],
    conversations: [
      {
        id: DEFAULT_GROUP_ID,
        title: "Security Council",
        subtitle: "Private group",
        kind: "private_group",
        visibility: "managed_private",
        participantIds: [],
        unreadCount: 0,
        lastActivityAt: issuedAt,
        lastMessagePreview: "No signals yet. Say hi to start the room.",
        messageProtection: "managed_plaintext",
        ownerUserId: undefined,
        joinCode: makeJoinCode(),
      },
      {
        id: DEFAULT_ROOM_ID,
        title: "Ops Room",
        subtitle: "Synq Ops",
        kind: "workspace_room",
        visibility: "managed_private",
        participantIds: [],
        unreadCount: 0,
        lastActivityAt: issuedAt,
        lastMessagePreview: "No signals yet. Start the conversation.",
        messageProtection: "managed_plaintext",
        ownerUserId: undefined,
        joinCode: makeJoinCode(),
        workspaceId: DEFAULT_WORKSPACE_ID,
      },
      {
        id: DEFAULT_CHANNEL_ID,
        title: "Team Updates",
        subtitle: "Announcement room",
        kind: "creator_channel",
        visibility: "managed_broadcast",
        participantIds: [],
        unreadCount: 0,
        lastActivityAt: issuedAt,
        lastMessagePreview: "Announcements will show up here.",
        messageProtection: "managed_plaintext",
        ownerUserId: undefined,
        joinCode: makeJoinCode(),
        workspaceId: DEFAULT_BROADCAST_ID,
      },
    ],
    channels,
    attachmentObjects: [],
    messages: [],
    pinnedMessages: [],
    conversationMemberships: [],
    typingIndicators: [],
    blockRecords: [],
    reports: [],
    moderationLogs: [],
    presence: [],
    auditEvents: [],
    disappearingJobs: [],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickArray<T>(value: unknown, fallback: T[]) {
  return Array.isArray(value) ? value : fallback;
}

function isLegacyImplicitDirectConversation(conversation: Conversation) {
  return (
    conversation.kind === "dm" &&
    (conversation.directState === "implicit" ||
      (conversation.directState === undefined &&
        conversation.title === LEGACY_IMPLICIT_DM_TITLE &&
        conversation.subtitle === LEGACY_IMPLICIT_DM_SUBTITLE))
  );
}

function conversationHasRealActivity(
  state: SynqBootstrapState,
  conversationId: string,
) {
  return (
    state.messages.some((message) => message.conversationId === conversationId) ||
    state.pinnedMessages.some((pin) => pin.conversationId === conversationId)
  );
}

function normalizeDirectConversationState(state: SynqBootstrapState) {
  const removedConversationIds = new Set(
    state.conversations
      .filter(
        (conversation) =>
          isLegacyImplicitDirectConversation(conversation) &&
          !conversationHasRealActivity(state, conversation.id),
      )
      .map((conversation) => conversation.id),
  );

  state.conversations = state.conversations
    .filter((conversation) => !removedConversationIds.has(conversation.id))
    .map((conversation) => {
      if (conversation.kind !== "dm") {
        return conversation;
      }

      return {
        ...conversation,
        directState:
          isLegacyImplicitDirectConversation(conversation) &&
          !conversationHasRealActivity(state, conversation.id)
            ? "implicit"
            : "started",
      };
    });

  state.conversationMemberships = state.conversationMemberships.filter(
    (membership) => !removedConversationIds.has(membership.conversationId),
  );
  state.typingIndicators = state.typingIndicators.filter(
    (indicator) => !removedConversationIds.has(indicator.conversationId),
  );
  state.messages = state.messages.filter(
    (message) => !removedConversationIds.has(message.conversationId),
  );
  state.pinnedMessages = state.pinnedMessages.filter(
    (pin) => !removedConversationIds.has(pin.conversationId),
  );
  state.reports = state.reports.filter(
    (report) => !report.conversationId || !removedConversationIds.has(report.conversationId),
  );
  state.auditEvents = state.auditEvents.filter(
    (event) => !event.conversationId || !removedConversationIds.has(event.conversationId),
  );
}

function hydratePersistedState(raw: unknown) {
  const seed = createSharedSeedState();

  if (!isRecord(raw)) {
    return seed;
  }

  const candidate = raw as Record<string, unknown>;

  return SynqBootstrapStateSchema.parse({
    ...seed,
    currentUserId:
      typeof candidate.currentUserId === "string"
        ? candidate.currentUserId
        : seed.currentUserId,
    currentDeviceId:
      typeof candidate.currentDeviceId === "string"
        ? candidate.currentDeviceId
        : seed.currentDeviceId,
    activeSession: isRecord(candidate.activeSession)
      ? {
          ...seed.activeSession,
          ...candidate.activeSession,
        }
      : seed.activeSession,
    users: pickArray(candidate.users, seed.users),
    recoveryMethods: pickArray(candidate.recoveryMethods, seed.recoveryMethods),
    devices: pickArray(candidate.devices, seed.devices),
    passkeys: pickArray(candidate.passkeys, seed.passkeys),
    deviceApprovals: pickArray(candidate.deviceApprovals, seed.deviceApprovals),
    workspacePolicies: pickArray(candidate.workspacePolicies, seed.workspacePolicies),
    workspaces: pickArray(candidate.workspaces, seed.workspaces),
    circles: pickArray(candidate.circles, seed.circles),
    conversations: pickArray(candidate.conversations, seed.conversations),
    channels: pickArray(candidate.channels, seed.channels),
    attachmentObjects: pickArray(candidate.attachmentObjects, seed.attachmentObjects),
    messages: pickArray(candidate.messages, seed.messages),
    pinnedMessages: pickArray(candidate.pinnedMessages, seed.pinnedMessages),
    conversationMemberships: pickArray(
      candidate.conversationMemberships,
      seed.conversationMemberships,
    ),
    typingIndicators: pickArray(candidate.typingIndicators, seed.typingIndicators),
    blockRecords: pickArray(candidate.blockRecords, seed.blockRecords),
    reports: pickArray(candidate.reports, seed.reports),
    moderationLogs: pickArray(candidate.moderationLogs, seed.moderationLogs),
    presence: pickArray(candidate.presence, seed.presence),
    auditEvents: pickArray(candidate.auditEvents, seed.auditEvents),
    disappearingJobs: pickArray(candidate.disappearingJobs, seed.disappearingJobs),
  });
}

function stripSeededArtifacts(state: SynqBootstrapState) {
  const nextState = structuredClone(state);
  const seededUserIds = new Set(
    nextState.users
      .filter(
        (user) =>
          SEEDED_USER_IDS.has(user.id) ||
          SEEDED_HANDLES.has(user.handle.toLowerCase()),
      )
      .map((user) => user.id),
  );

  const seededDeviceIds = new Set(
    nextState.devices
      .filter(
        (device) =>
          SEEDED_DEVICE_IDS.has(device.id) || seededUserIds.has(device.userId),
      )
      .map((device) => device.id),
  );

  nextState.users = nextState.users.filter((user) => !seededUserIds.has(user.id));
  nextState.recoveryMethods = nextState.recoveryMethods.filter((method) => {
    if (SEEDED_RECOVERY_VALUES.has(method.value)) {
      return false;
    }

    return ![...seededUserIds].some((userId) => method.id.includes(userId));
  });
  nextState.devices = nextState.devices.filter(
    (device) => !seededDeviceIds.has(device.id) && !seededUserIds.has(device.userId),
  );
  nextState.passkeys = nextState.passkeys.filter(
    (passkey) =>
      !seededUserIds.has(passkey.userId) && !seededDeviceIds.has(passkey.deviceId),
  );
  nextState.deviceApprovals = nextState.deviceApprovals.filter(
    (approval) =>
      !seededUserIds.has(approval.userId) &&
      !seededDeviceIds.has(approval.deviceId) &&
      (!approval.approvedByDeviceId ||
        !seededDeviceIds.has(approval.approvedByDeviceId)),
  );
  nextState.attachmentObjects = nextState.attachmentObjects.filter(
    (attachment) => !seededUserIds.has(attachment.ownerUserId),
  );
  nextState.messages = nextState.messages.filter(
    (message) =>
      !seededUserIds.has(message.senderId) &&
      !SEEDED_CONVERSATION_IDS.has(message.conversationId),
  );
  nextState.presence = nextState.presence.filter(
    (presence) => !seededUserIds.has(presence.userId),
  );
  nextState.auditEvents = nextState.auditEvents.filter(
    (event) =>
      (!event.userId || !seededUserIds.has(event.userId)) &&
      (!event.deviceId || !seededDeviceIds.has(event.deviceId)),
  );
  nextState.disappearingJobs = nextState.disappearingJobs.filter((job) =>
    nextState.messages.some((message) => message.id === job.messageId),
  );
  nextState.pinnedMessages = nextState.pinnedMessages.filter((pin) =>
    nextState.messages.some((message) => message.id === pin.messageId),
  );
  nextState.conversationMemberships = nextState.conversationMemberships.filter(
    (membership) =>
      !seededUserIds.has(membership.userId) &&
      nextState.conversations.some(
        (conversation) => conversation.id === membership.conversationId,
      ),
  );
  nextState.typingIndicators = nextState.typingIndicators.filter(
    (indicator) =>
      !seededUserIds.has(indicator.userId) &&
      nextState.conversations.some(
        (conversation) => conversation.id === indicator.conversationId,
      ),
  );
  nextState.blockRecords = nextState.blockRecords.filter(
    (record) =>
      !seededUserIds.has(record.blockerUserId) &&
      !seededUserIds.has(record.blockedUserId),
  );
  nextState.reports = nextState.reports.filter(
    (report) =>
      !seededUserIds.has(report.reporterUserId) &&
      (!report.targetUserId || !seededUserIds.has(report.targetUserId)),
  );
  nextState.moderationLogs = nextState.moderationLogs.filter(
    (log) =>
      !seededUserIds.has(log.actorUserId) &&
      (!log.targetUserId || !seededUserIds.has(log.targetUserId)),
  );
  nextState.workspacePolicies = nextState.workspacePolicies.map((policy) => {
    if (policy.workspaceId === DEFAULT_WORKSPACE_ID) {
      return {
        ...policy,
        inviteOnly: false,
        retentionDays: 90,
      };
    }

    if (policy.workspaceId === DEFAULT_BROADCAST_ID) {
      return {
        ...policy,
        inviteOnly: false,
        retentionDays: 365,
      };
    }

    return policy;
  });
  nextState.workspaces = nextState.workspaces.map((workspace) => {
    if (workspace.id === DEFAULT_WORKSPACE_ID) {
      return {
        ...workspace,
        name: "Synq Ops",
        slug: "synq-ops",
        description: "High-trust workspace for protected team coordination.",
        ambientScene: "Aurora Vault",
      };
    }

    if (workspace.id === DEFAULT_BROADCAST_ID) {
      return {
        ...workspace,
        name: "Leadership Updates",
        slug: "leadership-updates",
        description: "Announcements, drills, and policy notices for trusted teams.",
        ambientScene: "Coral Drift",
      };
    }

    return workspace;
  });
  nextState.circles = [];
  nextState.channels = nextState.channels.map((channel) => {
    if (channel.id === "channel_ops") {
      return {
        ...channel,
        name: "ops-room",
        purpose: "Daily coordination, secure check-ins, and incident follow-up.",
        kind: "workspace_room",
        visibility: "managed_private",
      };
    }

    if (channel.id === "channel_stage") {
      return {
        ...channel,
        name: "team-updates",
        purpose: "Leadership updates, drills, and policy notices.",
        kind: "creator_channel",
        visibility: "managed_broadcast",
      };
    }

    return channel;
  });

  nextState.conversations = nextState.conversations
    .filter(
      (conversation) =>
        !SEEDED_CONVERSATION_IDS.has(conversation.id) &&
        !(
          conversation.kind === "dm" &&
          conversation.participantIds.some((participantId) =>
            seededUserIds.has(participantId),
          )
        ),
    )
    .map((conversation) =>
      conversation.kind === "dm"
        ? conversation
        : (() => {
            const sanitizedConversation = {
              ...conversation,
              participantIds: conversation.participantIds.filter(
                (participantId) => !seededUserIds.has(participantId),
              ),
              unreadCount: 0,
              typingUserIds: [],
              lastMessagePreview:
                nextState.messages
                  .filter((message) => message.conversationId === conversation.id)
                  .at(-1)?.preview ??
                (conversation.kind === "creator_channel"
                  ? "Announcements will show up here."
                  : "No signals yet. Start the conversation."),
            };

            if (conversation.id === DEFAULT_GROUP_ID) {
              return {
                ...sanitizedConversation,
                title: "Security Council",
                subtitle: "Private group",
                kind: "private_group" as const,
                visibility: "managed_private" as const,
                messageProtection: "managed_plaintext" as const,
                joinCode: sanitizedConversation.joinCode ?? makeJoinCode(),
                workspaceId: undefined,
              };
            }

            if (conversation.id === DEFAULT_ROOM_ID) {
              return {
                ...sanitizedConversation,
                title: "Ops Room",
                subtitle: "Synq Ops",
                kind: "workspace_room" as const,
                visibility: "managed_private" as const,
                messageProtection: "managed_plaintext" as const,
                joinCode: sanitizedConversation.joinCode ?? makeJoinCode(),
                workspaceId: DEFAULT_WORKSPACE_ID,
              };
            }

            if (conversation.id === DEFAULT_CHANNEL_ID) {
              return {
                ...sanitizedConversation,
                title: "Team Updates",
                subtitle: "Announcement room",
                kind: "creator_channel" as const,
                visibility: "managed_broadcast" as const,
                messageProtection: "managed_plaintext" as const,
                joinCode: sanitizedConversation.joinCode ?? makeJoinCode(),
                workspaceId: DEFAULT_BROADCAST_ID,
              };
            }

            return sanitizedConversation;
          })(),
    );

  nextState.currentUserId = nextState.users[0]?.id ?? "bootstrap";
  nextState.currentDeviceId =
    nextState.devices.find((device) => device.userId === nextState.currentUserId)?.id ??
    nextState.devices[0]?.id ??
    "bootstrap_device";
  nextState.activeSession = {
    ...nextState.activeSession,
    userId: nextState.currentUserId,
    deviceId: nextState.currentDeviceId,
  };

  normalizeDirectConversationState(nextState);
  syncSharedMembership(nextState);
  return nextState;
}

function getMemoryState() {
  if (!globalThis.__synqSharedState) {
    globalThis.__synqSharedState = createSharedSeedState();
  }

  return globalThis.__synqSharedState;
}

function getMemoryBlobs() {
  if (!globalThis.__synqSharedBlobs) {
    globalThis.__synqSharedBlobs = new Map<string, AttachmentBlob>();
  }

  return globalThis.__synqSharedBlobs;
}

function getPool() {
  if (!POSTGRES_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: POSTGRES_URL,
      max: 1,
      ssl:
        POSTGRES_URL.includes("localhost") || POSTGRES_URL.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function ensureSchema() {
  const db = getPool();
  if (!db) {
    return;
  }

  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await db.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS synq_app_state (
            id TEXT PRIMARY KEY,
            state JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS synq_attachment_blobs (
            attachment_id TEXT PRIMARY KEY,
            encrypted_body_base64 TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
      } finally {
        client.release();
      }
    })();
  }

  await schemaReady;
}

async function loadState() {
  const db = getPool();
  if (!db) {
    const sanitized = stripSeededArtifacts(getMemoryState());
    globalThis.__synqSharedState = structuredClone(sanitized);
    return sanitized;
  }

  await ensureSchema();
  const client = await db.connect();
  try {
    const result = await client.query(
      "SELECT state FROM synq_app_state WHERE id = $1 LIMIT 1",
      [STORE_ROW_ID],
    );

    if (!result.rowCount) {
      const seed = createSharedSeedState();
      await client.query(
        "INSERT INTO synq_app_state (id, state, updated_at) VALUES ($1, $2::jsonb, NOW())",
        [STORE_ROW_ID, JSON.stringify(seed)],
      );
      return seed;
    }

    let parsed: SynqBootstrapState;

    try {
      parsed = hydratePersistedState(result.rows[0].state);
    } catch (error) {
      const reset = createSharedSeedState();
      console.error("[synq-store] Failed to hydrate persisted state. Resetting.", error);
      await client.query(
        "UPDATE synq_app_state SET state = $2::jsonb, updated_at = NOW() WHERE id = $1",
        [STORE_ROW_ID, JSON.stringify(reset)],
      );
      return reset;
    }

    const sanitized = stripSeededArtifacts(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      await client.query(
        "UPDATE synq_app_state SET state = $2::jsonb, updated_at = NOW() WHERE id = $1",
        [STORE_ROW_ID, JSON.stringify(sanitized)],
      );
    }

    return sanitized;
  } finally {
    client.release();
  }
}

async function saveState(state: SynqBootstrapState) {
  const db = getPool();
  if (!db) {
    globalThis.__synqSharedState = structuredClone(state);
    return;
  }

  await ensureSchema();
  await db.query(
    "INSERT INTO synq_app_state (id, state, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
    [STORE_ROW_ID, JSON.stringify(state)],
  );
}

async function saveAttachmentBlob(attachmentId: string, blob: AttachmentBlob) {
  const db = getPool();
  if (!db) {
    getMemoryBlobs().set(attachmentId, blob);
    return;
  }

  await ensureSchema();
  await db.query(
    "INSERT INTO synq_attachment_blobs (attachment_id, encrypted_body_base64, sha256, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (attachment_id) DO UPDATE SET encrypted_body_base64 = EXCLUDED.encrypted_body_base64, sha256 = EXCLUDED.sha256, updated_at = NOW()",
    [attachmentId, blob.encryptedBodyBase64, blob.sha256],
  );
}

async function loadAttachmentBlob(attachmentId: string) {
  const db = getPool();
  if (!db) {
    return getMemoryBlobs().get(attachmentId) ?? null;
  }

  await ensureSchema();
  const result = await db.query(
    "SELECT encrypted_body_base64, sha256 FROM synq_attachment_blobs WHERE attachment_id = $1 LIMIT 1",
    [attachmentId],
  );

  if (!result.rowCount) {
    return null;
  }

  return {
    encryptedBodyBase64: result.rows[0].encrypted_body_base64 as string,
    sha256: result.rows[0].sha256 as string,
  };
}

async function deleteAttachmentBlob(attachmentId: string) {
  const db = getPool();
  if (!db) {
    getMemoryBlobs().delete(attachmentId);
    return;
  }

  await ensureSchema();
  await db.query(
    "DELETE FROM synq_attachment_blobs WHERE attachment_id = $1",
    [attachmentId],
  );
}

function syncSharedMembership(state: SynqBootstrapState) {
  const userIds = state.users.map((user) => user.id);

  state.workspaces = state.workspaces.map((workspace) => ({
    ...workspace,
    memberCount: userIds.length,
  }));

  state.circles = state.circles.map((circle) => ({
    ...circle,
    memberCount: userIds.length,
  }));

  state.conversations = state.conversations.map((conversation) => {
    const participantIds =
      conversation.kind !== "dm" && GLOBAL_CONVERSATION_IDS.has(conversation.id)
        ? [...new Set([...conversation.participantIds, ...userIds])]
        : [...new Set(conversation.participantIds)];

    return {
      ...conversation,
      participantIds,
    };
  });

  state.conversationMemberships = state.conversationMemberships.filter(
    (membership) =>
      state.conversations.some(
        (conversation) =>
          conversation.id === membership.conversationId &&
          conversation.participantIds.includes(membership.userId),
      ),
  );

  for (const conversation of state.conversations) {
    for (const participantId of conversation.participantIds) {
      if (
        !state.conversationMemberships.some(
          (membership) =>
            membership.conversationId === conversation.id &&
            membership.userId === participantId,
        )
      ) {
        state.conversationMemberships.push({
          id: `membership_${conversation.id}_${participantId}`,
          conversationId: conversation.id,
          userId: participantId,
          joinedAt: nowIso(),
          lastReadAt: undefined,
          unreadCount: 0,
        });
      }
    }
  }
}

function hasBlockedRelationship(
  state: SynqBootstrapState,
  leftUserId: string,
  rightUserId: string,
) {
  return state.blockRecords.some(
    (record) =>
      (record.blockerUserId === leftUserId &&
        record.blockedUserId === rightUserId) ||
      (record.blockerUserId === rightUserId &&
        record.blockedUserId === leftUserId),
  );
}

function sanitizeUserForViewer(user: User, viewerId: string): User {
  if (user.id === viewerId) {
    return user;
  }

  const showHandleOnly = user.profileVisibility === "handle_only" || user.ghostMode;

  return {
    ...user,
    name: showHandleOnly ? `@${user.handle}` : user.name,
    avatar: user.hiddenAvatar ? "◌" : user.avatar,
    bio: user.privateDiscovery
      ? "Private discovery is enabled for this profile."
      : user.bio,
    linkedEmail: undefined,
    linkedPhone: undefined,
  };
}

function activeTypingUserIds(
  state: SynqBootstrapState,
  conversationId: string,
  viewerId: string,
) {
  const nowMs = Date.now();
  return [...new Set(
    state.typingIndicators
      .filter(
        (indicator) =>
          indicator.conversationId === conversationId &&
          indicator.userId !== viewerId &&
          new Date(indicator.expiresAt).getTime() > nowMs,
      )
      .map((indicator) => indicator.userId),
  )];
}

function membershipFor(
  state: SynqBootstrapState,
  conversationId: string,
  userId: string,
) {
  return state.conversationMemberships.find(
    (membership) =>
      membership.conversationId === conversationId && membership.userId === userId,
  );
}

function ensureMembership(
  state: SynqBootstrapState,
  conversationId: string,
  userId: string,
) {
  let membership = membershipFor(state, conversationId, userId);
  if (!membership) {
    membership = {
      id: `membership_${conversationId}_${userId}`,
      conversationId,
      userId,
      joinedAt: nowIso(),
      lastReadAt: undefined,
      unreadCount: 0,
    };
    state.conversationMemberships.push(membership);
  }

  return membership;
}

function markConversationRead(
  state: SynqBootstrapState,
  conversationId: string,
  userId: string,
) {
  const membership = ensureMembership(state, conversationId, userId);
  membership.lastReadAt = nowIso();
  membership.unreadCount = 0;
}

function ensureViewer(state: SynqBootstrapState, viewer: ViewerIdentity) {
  let user = state.users.find(
    (candidate) => candidate.linkedEmail?.toLowerCase() === viewer.email.toLowerCase(),
  );

  if (!user) {
    const nextId = `user_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const handle = nextAvailableHandle(
      state,
      baseHandleCandidate(viewer.email, viewer.name),
    );

    user = {
      id: nextId,
      name: viewer.name,
      handle,
      role: state.users.length === 0 ? "Owner" : "Member",
      avatar: (viewer.name.trim()[0] ?? viewer.email[0] ?? "S").toUpperCase(),
      bio: "Joined Synq through Google sign-in.",
      trustState: "verified",
      ghostMode: true,
      profileVisibility: "handle_only",
      hiddenAvatar: false,
      privateDiscovery: false,
      onboardingComplete: false,
      linkedEmail: viewer.email,
    };
    state.users.push(user);
    state.recoveryMethods.push({
      id: `recovery_${nextId}`,
      kind: "email",
      value: viewer.email,
      verifiedAt: nowIso(),
    });
  } else {
    user.name = viewer.name || user.name;
    user.avatar = (viewer.name?.trim()[0] ?? user.avatar ?? viewer.email[0] ?? "S").toUpperCase();
    user.linkedEmail = viewer.email;
  }

  let device = state.devices.find((candidate) => candidate.userId === user.id);
  if (!device) {
    device = createSessionDevice(user.id);
    state.devices.push(device);
  } else {
    device.lastSeenAt = nowIso();
    device.trustState = "approved";
  }

  syncSharedMembership(state);
  for (const conversation of state.conversations) {
    if (conversation.participantIds.includes(user.id)) {
      ensureMembership(state, conversation.id, user.id);
    }
  }

  return {
    userId: user.id,
    deviceId: device.id,
  };
}

function buildSessionEnvelope(userId: string, deviceId: string) {
  const issuedAt = nowIso();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `oauth_${userId}`,
    userId,
    deviceId,
    scope: "web" as const,
    accessToken: "cookie-session",
    refreshToken: "cookie-session",
    issuedAt,
    expiresAt,
    refreshExpiresAt: expiresAt,
    pendingApproval: false,
  };
}

function personalizeConversations(state: SynqBootstrapState, viewerId: string) {
  const presentedUsers = state.users.map((user) => sanitizeUserForViewer(user, viewerId));

  return state.conversations
    .filter((conversation) => {
      if (!conversation.participantIds.includes(viewerId)) {
        return false;
      }

      if (conversation.kind !== "dm") {
        return true;
      }

      const otherId = conversation.participantIds.find(
        (participantId) => participantId !== viewerId,
      );
      return !otherId || !hasBlockedRelationship(state, viewerId, otherId);
    })
    .map((conversation) => {
      const membership = membershipFor(state, conversation.id, viewerId);
      const typingUserIds = activeTypingUserIds(state, conversation.id, viewerId);

      if (conversation.kind !== "dm") {
        return {
          ...conversation,
          unreadCount: membership?.unreadCount ?? 0,
          typingUserIds,
        };
      }

      const otherId = conversation.participantIds.find((participantId) => participantId !== viewerId);
      const other = presentedUsers.find((user) => user.id === otherId);

      return {
        ...conversation,
        title: other?.name ?? "Direct signal",
        subtitle: other?.handle ? `@${other.handle}` : "Direct message",
        unreadCount: membership?.unreadCount ?? 0,
        typingUserIds,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.lastActivityAt).getTime() -
        new Date(left.lastActivityAt).getTime(),
    );
}

function relevantMessages(state: SynqBootstrapState, viewerId: string, conversationIds: Set<string>) {
  const blockedUserIds = new Set(
    state.blockRecords
      .filter((record) => record.blockerUserId === viewerId)
      .map((record) => record.blockedUserId),
  );

  return state.messages
    .filter(
      (message) =>
        conversationIds.has(message.conversationId) &&
        !blockedUserIds.has(message.senderId) &&
        state.conversations
          .find((conversation) => conversation.id === message.conversationId)
          ?.participantIds.includes(viewerId),
    )
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
}

function buildBootstrapState(state: SynqBootstrapState, viewerId: string, deviceId: string) {
  const cloned = structuredClone(state);
  const conversations = personalizeConversations(cloned, viewerId);
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const users = cloned.users.map((user) => sanitizeUserForViewer(user, viewerId));
  const isModerator =
    cloned.users.find((user) => user.id === viewerId)?.role === "Owner" ||
    cloned.users.find((user) => user.id === viewerId)?.role === "Moderator";
  const channelUnreadCounts = new Map<string, number>();

  for (const conversation of conversations) {
    if (!conversation.workspaceId) {
      continue;
    }

    const current = channelUnreadCounts.get(conversation.workspaceId) ?? 0;
    channelUnreadCounts.set(
      conversation.workspaceId,
      current + (conversation.unreadCount ?? 0),
    );
  }

  return SynqBootstrapStateSchema.parse({
    ...cloned,
    currentUserId: viewerId,
    currentDeviceId: deviceId,
    activeSession: buildSessionEnvelope(viewerId, deviceId),
    users,
    devices: cloned.devices,
    conversations,
    channels: cloned.channels.map((channel) => ({
      ...channel,
      unreadCount: channelUnreadCounts.get(channel.workspaceId) ?? 0,
    })),
    messages: relevantMessages(cloned, viewerId, conversationIds),
    pinnedMessages: cloned.pinnedMessages.filter((pin) =>
      conversationIds.has(pin.conversationId),
    ),
    conversationMemberships: cloned.conversationMemberships.filter(
      (membership) => membership.userId === viewerId,
    ),
    typingIndicators: cloned.typingIndicators.filter(
      (indicator) =>
        conversationIds.has(indicator.conversationId) &&
        new Date(indicator.expiresAt).getTime() > Date.now(),
    ),
    blockRecords: cloned.blockRecords.filter(
      (record) => record.blockerUserId === viewerId,
    ),
    reports: isModerator
      ? cloned.reports
      : cloned.reports.filter((report) => report.reporterUserId === viewerId),
    moderationLogs: isModerator
      ? cloned.moderationLogs
      : cloned.moderationLogs.filter((log) => log.actorUserId === viewerId),
  });
}

function conversationForUser(
  state: SynqBootstrapState,
  conversationId: string,
  viewerId: string,
) {
  return state.conversations.find(
    (conversation) =>
      conversation.id === conversationId &&
      conversation.participantIds.includes(viewerId),
  );
}

function findUserByHandle(state: SynqBootstrapState, handle: string) {
  return state.users.find(
    (user) => user.handle.toLowerCase() === sanitizeHandle(handle).toLowerCase(),
  );
}

function isModerator(state: SynqBootstrapState, userId: string) {
  const role = state.users.find((user) => user.id === userId)?.role;
  return role === "Owner" || role === "Moderator";
}

function touchConversation(
  state: SynqBootstrapState,
  conversationId: string,
  preview: string,
  createdAt = nowIso(),
) {
  const target = state.conversations.find((item) => item.id === conversationId);
  if (!target) {
    return;
  }

  target.lastActivityAt = createdAt;
  target.lastMessagePreview = preview;
}

async function withStateMutation<T>(
  viewer: ViewerIdentity,
  mutate: (state: SynqBootstrapState, ids: { userId: string; deviceId: string }) => Promise<T> | T,
) {
  const state = await loadState();
  const ids = ensureViewer(state, viewer);
  const result = await mutate(state, ids);
  await saveState(state);
  return result;
}

export async function getBootstrapState(viewer: ViewerIdentity) {
  return withStateMutation(viewer, async (state, ids) =>
    buildBootstrapState(state, ids.userId, ids.deviceId),
  );
}

export async function completeViewerOnboarding(
  viewer: ViewerIdentity,
  payload: OnboardingRequest,
) {
  const parsed = OnboardingRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const nextHandle = sanitizeHandle(parsed.handle);
    if (nextHandle.length < 3) {
      throw new Error("Handle must be at least 3 characters.");
    }

    const currentUser = state.users.find((user) => user.id === ids.userId);
    if (!currentUser) {
      throw new Error("Current user not found.");
    }

    const existingOwner = state.users.find(
      (user) =>
        user.id !== ids.userId && user.handle.toLowerCase() === nextHandle.toLowerCase(),
    );
    if (existingOwner) {
      throw new Error("That handle is already claimed.");
    }

    currentUser.name = parsed.name.trim();
    currentUser.handle = nextHandle;
    currentUser.avatar = (parsed.name.trim()[0] ?? currentUser.avatar).toUpperCase();
    currentUser.ghostMode = parsed.ghostMode;
    currentUser.profileVisibility = parsed.profileVisibility;
    currentUser.hiddenAvatar = parsed.hiddenAvatar;
    currentUser.privateDiscovery = parsed.privateDiscovery;
    currentUser.onboardingComplete = true;
    currentUser.linkedEmail = viewer.email;

    for (const method of parsed.recoveryMethods) {
      const exists = state.recoveryMethods.find(
        (candidate) =>
          candidate.kind === method.kind &&
          candidate.value === method.value &&
          candidate.id.startsWith(`recovery_${ids.userId}`),
      );

      if (!exists) {
        state.recoveryMethods.push({
          id: `recovery_${ids.userId}_${method.kind}_${state.recoveryMethods.length + 1}`,
          kind: method.kind,
          value: method.value,
        });
      }
    }

    return { ok: true };
  });
}

export async function updateViewerProfile(
  viewer: ViewerIdentity,
  payload: ProfileUpdateRequest,
) {
  const parsed = ProfileUpdateRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const currentUser = state.users.find((user) => user.id === ids.userId);
    if (!currentUser) {
      throw new Error("Current user not found.");
    }

    currentUser.name = parsed.name.trim();
    currentUser.bio = parsed.bio.trim();
    currentUser.avatar = parsed.avatar.trim().slice(0, 2) || currentUser.avatar;
    currentUser.ghostMode = parsed.ghostMode;
    currentUser.profileVisibility = parsed.profileVisibility;
    currentUser.hiddenAvatar = parsed.hiddenAvatar;
    currentUser.privateDiscovery = parsed.privateDiscovery;
    return currentUser;
  });
}

export async function createConversationRoom(
  viewer: ViewerIdentity,
  payload: ConversationCreateRequest,
) {
  const parsed = ConversationCreateRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const participantIds = new Set<string>([ids.userId, ...parsed.participantIds]);
    for (const handle of parsed.participantHandles) {
      const match = findUserByHandle(state, handle);
      if (match && !hasBlockedRelationship(state, ids.userId, match.id)) {
        participantIds.add(match.id);
      }
    }

    if (parsed.kind === "dm") {
      const others = [...participantIds].filter((participantId) => participantId !== ids.userId);
      if (others.length !== 1) {
        throw new Error("Direct signals require exactly one other participant.");
      }

      const existingId = buildDmId(ids.userId, others[0]);
      const existing = state.conversations.find((conversation) => conversation.id === existingId);
      if (existing) {
        if (existing.kind === "dm" && existing.directState !== "started") {
          existing.directState = "started";
        }
        markConversationRead(state, existing.id, ids.userId);
        return existing;
      }
    }

    const conversationId =
      parsed.kind === "dm"
        ? buildDmId(ids.userId, [...participantIds].find((participantId) => participantId !== ids.userId) ?? ids.userId)
        : `conv_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const createdAt = nowIso();
    const conversation = ConversationSchema.parse({
      id: conversationId,
      title: parsed.title.trim(),
      subtitle: parsed.subtitle.trim(),
      kind: parsed.kind,
      visibility: parsed.visibility,
      participantIds: [...participantIds],
      unreadCount: 0,
      disappearingSeconds: parsed.disappearingSeconds,
      lastActivityAt: createdAt,
      lastMessagePreview: "Room created. Invite your team with the join code.",
      messageProtection: "managed_plaintext",
      ownerUserId: ids.userId,
      joinCode: parsed.kind === "dm" ? undefined : makeJoinCode(),
      directState: parsed.kind === "dm" ? "started" : undefined,
      workspaceId:
        parsed.kind === "workspace_room" || parsed.kind === "creator_channel"
          ? parsed.workspaceId ?? DEFAULT_WORKSPACE_ID
          : undefined,
    });

    state.conversations.push(conversation);
    syncSharedMembership(state);
    for (const participantId of conversation.participantIds) {
      ensureMembership(state, conversation.id, participantId);
    }
    markConversationRead(state, conversation.id, ids.userId);
    return conversation;
  });
}

export async function joinConversationWithCode(
  viewer: ViewerIdentity,
  payload: ConversationJoinRequest,
) {
  const parsed = ConversationJoinRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const conversation = state.conversations.find(
      (item) =>
        item.joinCode?.toUpperCase() === parsed.code.toUpperCase() &&
        item.kind !== "dm",
    );
    if (!conversation) {
      throw new Error("Join code not found.");
    }

    if (!conversation.participantIds.includes(ids.userId)) {
      conversation.participantIds = [...conversation.participantIds, ids.userId];
    }

    syncSharedMembership(state);
    markConversationRead(state, conversation.id, ids.userId);
    return conversation;
  });
}

export async function startDirectConversation(
  viewer: ViewerIdentity,
  payload: DirectConversationRequest,
) {
  const parsed = DirectConversationRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const target = findUserByHandle(state, parsed.handle);
    if (!target || target.id === ids.userId) {
      throw new Error("That handle is not available.");
    }

    if (hasBlockedRelationship(state, ids.userId, target.id)) {
      throw new Error("You cannot start a direct signal with this account.");
    }

    const conversationId = buildDmId(ids.userId, target.id);
    let conversation = state.conversations.find((item) => item.id === conversationId);

    if (!conversation) {
      conversation = ConversationSchema.parse({
        id: conversationId,
        title: target.name,
        subtitle: `@${target.handle}`,
        kind: "dm",
        visibility: "managed_private",
        participantIds: [ids.userId, target.id],
        unreadCount: 0,
        lastActivityAt: nowIso(),
        lastMessagePreview: `${target.name} is reachable now.`,
        messageProtection: "managed_plaintext",
        ownerUserId: ids.userId,
        directState: "started",
      });
      state.conversations.push(conversation);
    } else if (conversation.kind === "dm" && conversation.directState !== "started") {
      conversation.directState = "started";
    }

    syncSharedMembership(state);
    markConversationRead(state, conversation.id, ids.userId);
    return conversation;
  });
}

export async function deleteConversationRoom(
  viewer: ViewerIdentity,
  conversationId: string,
) {
  return withStateMutation(viewer, async (state, ids) => {
    const conversation = conversationForUser(state, conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    if (conversation.kind === "dm") {
      throw new Error("Direct signals cannot be deleted from room tools.");
    }

    if (conversation.ownerUserId !== ids.userId) {
      throw new Error("Only the room owner can delete this room.");
    }

    const attachmentIds = new Set(
      state.messages
        .filter((message) => message.conversationId === conversationId)
        .flatMap((message) => message.attachments.map((attachment) => attachment.id)),
    );

    state.conversations = state.conversations.filter(
      (item) => item.id !== conversationId,
    );
    state.messages = state.messages.filter(
      (message) => message.conversationId !== conversationId,
    );
    state.pinnedMessages = state.pinnedMessages.filter(
      (pin) => pin.conversationId !== conversationId,
    );
    state.typingIndicators = state.typingIndicators.filter(
      (indicator) => indicator.conversationId !== conversationId,
    );
    state.conversationMemberships = state.conversationMemberships.filter(
      (membership) => membership.conversationId !== conversationId,
    );
    state.reports = state.reports.filter(
      (report) => report.conversationId !== conversationId,
    );
    state.moderationLogs = state.moderationLogs.filter(
      (log) => log.conversationId !== conversationId,
    );
    state.auditEvents = state.auditEvents.filter(
      (event) => event.conversationId !== conversationId,
    );
    state.disappearingJobs = state.disappearingJobs.filter(
      (job) => job.conversationId !== conversationId,
    );
    state.attachmentObjects = state.attachmentObjects.filter(
      (attachment) => !attachmentIds.has(attachment.id),
    );

    for (const attachmentId of attachmentIds) {
      await deleteAttachmentBlob(attachmentId);
    }

    syncSharedMembership(state);

    return {
      ok: true,
      conversationId,
    };
  });
}

export async function findContacts(viewer: ViewerIdentity, query?: string) {
  const normalizedQuery = sanitizeHandle(query ?? "");
  const state = await getBootstrapState(viewer);

  return state.users
    .filter((user) => user.id !== state.currentUserId)
    .filter((user) => {
      if (!normalizedQuery) {
        return !user.privateDiscovery;
      }

      const exactHandle = user.handle.toLowerCase() === normalizedQuery.toLowerCase();
      if (user.privateDiscovery) {
        return exactHandle;
      }

      return (
        exactHandle ||
        user.name.toLowerCase().includes(normalizedQuery.toLowerCase()) ||
        user.handle.toLowerCase().includes(normalizedQuery.toLowerCase())
      );
    })
    .slice(0, 8);
}

export async function markConversationReadForViewer(
  viewer: ViewerIdentity,
  conversationId: string,
) {
  return withStateMutation(viewer, async (state, ids) => {
    const conversation = conversationForUser(state, conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    markConversationRead(state, conversation.id, ids.userId);
    return { ok: true };
  });
}

export async function updateTypingIndicator(
  viewer: ViewerIdentity,
  conversationId: string,
  payload: ConversationTypingRequest,
) {
  const parsed = ConversationTypingRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const conversation = conversationForUser(state, conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    state.typingIndicators = state.typingIndicators.filter(
      (indicator) =>
        !(
          indicator.conversationId === conversationId &&
          indicator.userId === ids.userId
        ),
    );

    if (parsed.isTyping) {
      state.typingIndicators.push({
        conversationId,
        userId: ids.userId,
        expiresAt: new Date(Date.now() + 8_000).toISOString(),
      });
    }

    return { ok: true };
  });
}

export async function listConversationMessages(
  viewer: ViewerIdentity,
  conversationId: string,
) {
  const state = await getBootstrapState(viewer);
  return state.messages.filter((message) => message.conversationId === conversationId);
}

export async function createMessage(
  viewer: ViewerIdentity,
  conversationId: string,
  payload: unknown,
) {
  const parsed = SendMessageRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const conversation = conversationForUser(state, conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const message = MessageEnvelopeSchema.parse({
      id: `msg_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      clientId: parsed.clientId,
      conversationId,
      senderId: ids.userId,
      ciphertext: parsed.ciphertext,
      preview:
        parsed.preview?.trim() ||
        (parsed.attachments?.length
          ? `Sent ${parsed.attachments.length} secure attachment${parsed.attachments.length > 1 ? "s" : ""}.`
          : "Private beta signal."),
      createdAt: nowIso(),
      status: "sent",
      messageProtection: conversation.visibility === "managed_broadcast"
        ? "managed_plaintext"
        : parsed.messageProtection ?? "managed_plaintext",
      mentions: parsed.mentions ?? [],
      replyToId: parsed.replyToId,
      reactions: [],
      attachments: parsed.attachments ?? [],
    });

    state.messages.push(message);
    touchConversation(state, conversationId, message.preview, message.createdAt);
    for (const participantId of conversation.participantIds) {
      const membership = ensureMembership(state, conversationId, participantId);
      if (participantId === ids.userId) {
        membership.lastReadAt = message.createdAt;
        membership.unreadCount = 0;
      } else {
        membership.unreadCount += 1;
      }
    }

    return message;
  });
}

export async function toggleMessageReaction(
  viewer: ViewerIdentity,
  messageId: string,
  payload: unknown,
) {
  const parsed = MessageReactionRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    const conversation = conversationForUser(state, message.conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const existingIndex = message.reactions.findIndex(
      (reaction) =>
        reaction.userId === ids.userId && reaction.emoji === parsed.emoji,
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions.push({
        emoji: parsed.emoji,
        userId: ids.userId,
        createdAt: nowIso(),
      });
    }

    return message;
  });
}

export async function toggleMessagePin(
  viewer: ViewerIdentity,
  messageId: string,
  payload: unknown,
) {
  const parsed = MessagePinRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    const conversation = conversationForUser(state, message.conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    state.pinnedMessages = state.pinnedMessages.filter(
      (pin) => pin.messageId !== messageId,
    );

    if (parsed.pinned) {
      state.pinnedMessages.unshift({
        id: `pin_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        conversationId: message.conversationId,
        messageId,
        pinnedByUserId: ids.userId,
        createdAt: nowIso(),
      });
    }

    return { ok: true };
  });
}

export async function updateMessage(
  viewer: ViewerIdentity,
  messageId: string,
  payload: unknown,
) {
  const parsed = MessageUpdateRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    const conversation = conversationForUser(state, message.conversationId, ids.userId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const canEdit = message.senderId === ids.userId || isModerator(state, ids.userId);
    if (!canEdit) {
      throw new Error("You cannot change this message.");
    }

    if (parsed.deleted) {
      message.preview = "Message deleted.";
      message.ciphertext = "deleted";
      message.deletedAt = nowIso();
      message.attachments = [];
      message.reactions = [];
    } else {
      if (parsed.preview) {
        message.preview = parsed.preview;
      }
      if (parsed.ciphertext) {
        message.ciphertext = parsed.ciphertext;
      }
      message.editedAt = nowIso();
    }

    touchConversation(state, message.conversationId, message.preview, nowIso());
    return message;
  });
}

export async function blockUserForViewer(
  viewer: ViewerIdentity,
  payload: BlockUserRequest,
) {
  const parsed = BlockUserRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    if (parsed.targetUserId === ids.userId) {
      throw new Error("You cannot block yourself.");
    }

    if (
      !state.blockRecords.some(
        (record) =>
          record.blockerUserId === ids.userId &&
          record.blockedUserId === parsed.targetUserId,
      )
    ) {
      state.blockRecords.push({
        id: `block_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
        blockerUserId: ids.userId,
        blockedUserId: parsed.targetUserId,
        createdAt: nowIso(),
      });
    }

    return { ok: true };
  });
}

export async function createModerationReport(
  viewer: ViewerIdentity,
  payload: ReportCreateRequest,
) {
  const parsed = ReportCreateRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const report: ReportRecord = {
      id: `report_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      reporterUserId: ids.userId,
      targetUserId: parsed.targetUserId,
      conversationId: parsed.conversationId,
      messageId: parsed.messageId,
      reason: parsed.reason,
      note: parsed.note,
      createdAt: nowIso(),
    };
    const moderationLog: ModerationLog = {
      id: `mod_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      actorUserId: ids.userId,
      targetUserId: parsed.targetUserId,
      conversationId: parsed.conversationId,
      messageId: parsed.messageId,
      action: "report.created",
      createdAt: nowIso(),
      details: {
        reason: parsed.reason,
      },
    };

    state.reports.unshift(report);
    state.moderationLogs.unshift(moderationLog);
    return report;
  });
}

export async function signAttachment(viewer: ViewerIdentity, payload: AttachmentSignRequest) {
  const parsed = AttachmentSignRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const attachmentId = `att_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const keyId = `attk_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const nonce = createAttachmentNonce();
    const secret = createAttachmentKey();
    const object: AttachmentObject = {
      id: attachmentId,
      ownerUserId: ids.userId,
      keyId,
      status: "pending",
      uploadUrl: `/api/synq/attachments/${attachmentId}/upload`,
      encryptedUrl: `/api/synq/attachments/${attachmentId}/content`,
      createdAt: nowIso(),
    };

    state.attachmentObjects = [
      ...state.attachmentObjects.filter((item) => item.id !== attachmentId),
      object,
    ];

    return {
      attachmentId,
      keyId,
      uploadUrl: object.uploadUrl,
      encryptedUrl: object.encryptedUrl ?? "",
      nonce,
      secret,
      status: object.status,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      size: parsed.size,
    };
  });
}

export async function uploadAttachment(
  viewer: ViewerIdentity,
  attachmentId: string,
  payload: AttachmentUploadRequest,
) {
  const parsed = AttachmentUploadRequestSchema.parse(payload);
  const sha256 = createHash("sha256")
    .update(parsed.encryptedBodyBase64)
    .digest("hex");

  return withStateMutation(viewer, async (state, ids) => {
    const target = state.attachmentObjects.find(
      (item) => item.id === attachmentId && item.ownerUserId === ids.userId,
    );
    if (!target) {
      throw new Error("Attachment not found.");
    }

    target.status = "uploaded";
    target.uploadedAt = nowIso();
    target.byteLength = Buffer.byteLength(parsed.encryptedBodyBase64, "utf8");
    target.sha256 = sha256;

    await saveAttachmentBlob(attachmentId, {
      encryptedBodyBase64: parsed.encryptedBodyBase64,
      sha256,
    });

    return {
      attachmentId,
      status: target.status,
      byteLength: target.byteLength ?? 0,
      sha256,
    };
  });
}

export async function finalizeAttachment(
  viewer: ViewerIdentity,
  payload: AttachmentFinalizeRequest,
) {
  const parsed = AttachmentFinalizeRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const target = state.attachmentObjects.find(
      (item) => item.id === parsed.attachmentId && item.ownerUserId === ids.userId,
    );
    if (!target) {
      throw new Error("Attachment not found.");
    }

    target.keyId = parsed.keyId;
    target.encryptedUrl = parsed.encryptedUrl;
    target.status = "committed";
    target.committedAt = nowIso();

    return { ok: true };
  });
}

export async function readAttachmentContent(
  viewer: ViewerIdentity,
  attachmentId: string,
) {
  const state = await getBootstrapState(viewer);
  const owned = state.attachmentObjects.find((item) => item.id === attachmentId);
  if (!owned) {
    throw new Error("Attachment not found.");
  }

  return loadAttachmentBlob(attachmentId);
}

export async function renameViewerDevice(
  viewer: ViewerIdentity,
  payload: DeviceLabelUpdateRequest,
) {
  const parsed = DeviceLabelUpdateRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    const device = state.devices.find(
      (item) => item.id === parsed.deviceId && item.userId === ids.userId,
    );
    if (!device) {
      throw new Error("Device not found.");
    }

    device.label = parsed.label.trim();
    return device;
  });
}

export async function revokeViewerDevice(
  viewer: ViewerIdentity,
  payload: { deviceId: string },
) {
  const deviceId = payload.deviceId;

  return withStateMutation(viewer, async (state, ids) => {
    if (deviceId === ids.deviceId) {
      throw new Error("Use sign out to end the active session.");
    }

    const device = state.devices.find(
      (item) => item.id === deviceId && item.userId === ids.userId,
    );
    if (!device) {
      throw new Error("Device not found.");
    }

    device.trustState = "revoked";
    device.revokedAt = nowIso();
    return device;
  });
}

export async function deleteViewerAccount(
  viewer: ViewerIdentity,
  payload: AccountDeleteRequest,
) {
  const parsed = AccountDeleteRequestSchema.parse(payload);

  return withStateMutation(viewer, async (state, ids) => {
    if (parsed.confirm !== "DELETE MY ACCOUNT") {
      throw new Error("Confirmation did not match.");
    }

    const removedConversationIds = new Set(
      state.conversations
        .filter(
          (conversation) =>
            conversation.kind === "dm" &&
            conversation.participantIds.includes(ids.userId),
        )
        .map((conversation) => conversation.id),
    );

    state.users = state.users.filter((user) => user.id !== ids.userId);
    state.recoveryMethods = state.recoveryMethods.filter(
      (method) => !method.id.includes(ids.userId) && method.value !== viewer.email,
    );
    state.devices = state.devices.filter((device) => device.userId !== ids.userId);
    state.passkeys = state.passkeys.filter((passkey) => passkey.userId !== ids.userId);
    state.deviceApprovals = state.deviceApprovals.filter(
      (approval) =>
        approval.userId !== ids.userId &&
        approval.approvedByDeviceId !== ids.deviceId,
    );
    state.attachmentObjects = state.attachmentObjects.filter(
      (attachment) => attachment.ownerUserId !== ids.userId,
    );
    state.messages = state.messages.filter((message) => message.senderId !== ids.userId);
    state.pinnedMessages = state.pinnedMessages.filter(
      (pin) => !removedConversationIds.has(pin.conversationId),
    );
    state.typingIndicators = state.typingIndicators.filter(
      (indicator) => indicator.userId !== ids.userId,
    );
    state.blockRecords = state.blockRecords.filter(
      (record) =>
        record.blockerUserId !== ids.userId && record.blockedUserId !== ids.userId,
    );
    state.reports = state.reports.filter(
      (report) =>
        report.reporterUserId !== ids.userId && report.targetUserId !== ids.userId,
    );
    state.moderationLogs = state.moderationLogs.filter(
      (log) => log.actorUserId !== ids.userId && log.targetUserId !== ids.userId,
    );
    state.conversations = state.conversations
      .filter((conversation) => !removedConversationIds.has(conversation.id))
      .map((conversation) => ({
        ...conversation,
        participantIds: conversation.participantIds.filter(
          (participantId) => participantId !== ids.userId,
        ),
      }));
    state.conversationMemberships = state.conversationMemberships.filter(
      (membership) => membership.userId !== ids.userId,
    );

    if (state.users.length && !state.users.some((user) => user.role === "Owner")) {
      state.users[0] = {
        ...state.users[0],
        role: "Owner",
      };
    }

    syncSharedMembership(state);
    return { ok: true };
  });
}

export async function getReadiness() {
  return {
    ok: true,
    service: "synq-web-api",
    mode: getPool() ? "postgres" : "memory",
    at: nowIso(),
  };
}
