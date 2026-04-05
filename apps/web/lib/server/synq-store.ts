import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  createAttachmentKey,
  createAttachmentNonce,
  fingerprintKey,
  generateDeviceKeyPair,
} from "@synq/crypto";
import {
  AIActionRequestSchema,
  AttachmentFinalizeRequestSchema,
  AttachmentSignRequestSchema,
  AttachmentUploadRequestSchema,
  ConversationSchema,
  MessageEnvelopeSchema,
  OnboardingRequestSchema,
  SendMessageRequestSchema,
  type AIActionRequest,
  type AttachmentFinalizeRequest,
  type AttachmentObject,
  type AttachmentSignRequest,
  type AttachmentUploadRequest,
  type Channel,
  type Conversation,
  type Device,
  type MessageEnvelope,
  type OnboardingRequest,
  type SynqBootstrapState,
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
      name: "lobby-feed",
      purpose: "Shared room for everyone who joins Synq.",
      kind: "workspace_room",
      visibility: "managed_private",
      unreadCount: 0,
    },
    {
      id: "channel_stage",
      workspaceId: DEFAULT_BROADCAST_ID,
      name: "product-news",
      purpose: "Announcements and launch notes from the project owner.",
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
        aiPolicy: "local_only",
        inviteOnly: false,
        retentionDays: 90,
      },
      {
        id: "policy_ghost",
        workspaceId: DEFAULT_BROADCAST_ID,
        aiPolicy: "managed_opt_in",
        inviteOnly: false,
        retentionDays: 365,
      },
    ],
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: "Synq Lobby",
        slug: "synq-lobby",
        description: "Shared space for everyone using the live Synq demo.",
        ambientScene: "Aurora Vault",
        memberCount: 0,
        aiPolicy: "local",
        policyId: "policy_synq",
      },
      {
        id: DEFAULT_BROADCAST_ID,
        name: "Synq Broadcast",
        slug: "synq-broadcast",
        description: "Product updates, drops, and public announcements.",
        ambientScene: "Coral Drift",
        memberCount: 0,
        aiPolicy: "ephemeral_cloud",
        policyId: "policy_ghost",
      },
    ],
    circles: [],
    conversations: [
      {
        id: DEFAULT_GROUP_ID,
        title: "Common Room",
        subtitle: "Private group",
        kind: "private_group",
        visibility: "managed_private",
        participantIds: [],
        unreadCount: 0,
        lastActivityAt: issuedAt,
        lastMessagePreview: "No signals yet. Say hi to start the room.",
        messageProtection: "managed_plaintext",
        aiPolicyOverride: "inherit",
      },
      {
        id: DEFAULT_ROOM_ID,
        title: "Lobby Feed",
        subtitle: "Synq Lobby",
        kind: "workspace_room",
        visibility: "managed_private",
        participantIds: [],
        unreadCount: 0,
        lastActivityAt: issuedAt,
        lastMessagePreview: "No signals yet. Start the conversation.",
        messageProtection: "managed_plaintext",
        aiPolicyOverride: "inherit",
        workspaceId: DEFAULT_WORKSPACE_ID,
      },
      {
        id: DEFAULT_CHANNEL_ID,
        title: "Product News",
        subtitle: "Broadcast room",
        kind: "creator_channel",
        visibility: "managed_broadcast",
        participantIds: [],
        unreadCount: 0,
        lastActivityAt: issuedAt,
        lastMessagePreview: "Announcements will show up here.",
        messageProtection: "managed_plaintext",
        aiPolicyOverride: "ephemeral_cloud",
        workspaceId: DEFAULT_BROADCAST_ID,
      },
    ],
    channels,
    attachmentObjects: [],
    messages: [],
    presence: [],
    auditEvents: [],
    disappearingJobs: [],
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
        : {
            ...conversation,
            participantIds: conversation.participantIds.filter(
              (participantId) => !seededUserIds.has(participantId),
            ),
            unreadCount: 0,
            lastMessagePreview:
              nextState.messages
                .filter((message) => message.conversationId === conversation.id)
                .at(-1)?.preview ??
              (conversation.kind === "creator_channel"
                ? "Announcements will show up here."
                : "No signals yet. Start the conversation."),
          },
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
    return structuredClone(getMemoryState());
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

    const parsed = SynqBootstrapStateSchema.parse(result.rows[0].state);
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
    if (conversation.kind === "dm") {
      return conversation;
    }

    return {
      ...conversation,
      participantIds: [...new Set([...conversation.participantIds, ...userIds])],
    };
  });
}

function ensureDirectMessages(state: SynqBootstrapState, userId: string) {
  for (const other of state.users) {
    if (other.id === userId) {
      continue;
    }

    const conversationId = buildDmId(userId, other.id);
    if (state.conversations.some((conversation) => conversation.id === conversationId)) {
      continue;
    }

    state.conversations.push(
      ConversationSchema.parse({
        id: conversationId,
        title: "Direct signal",
        subtitle: "Invite-only room",
        kind: "dm",
        visibility: "managed_private",
        participantIds: [userId, other.id],
        unreadCount: 0,
        lastActivityAt: nowIso(),
        lastMessagePreview: `${other.name} is reachable now.`,
        messageProtection: "managed_plaintext",
        aiPolicyOverride: "inherit",
      }),
    );
  }
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
      role: "Member",
      avatar: (viewer.name.trim()[0] ?? viewer.email[0] ?? "S").toUpperCase(),
      bio: "Joined the invite-only Synq beta through Google sign-in.",
      trustState: "verified",
      aiPolicy: "local",
      ghostMode: true,
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

  ensureDirectMessages(state, user.id);
  syncSharedMembership(state);

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
  return state.conversations
    .filter((conversation) => conversation.participantIds.includes(viewerId))
    .map((conversation) => {
      if (conversation.kind !== "dm") {
        return conversation;
      }

      const otherId = conversation.participantIds.find((participantId) => participantId !== viewerId);
      const other = state.users.find((user) => user.id === otherId);

      return {
        ...conversation,
        title: other?.name ?? "Direct signal",
        subtitle: other?.handle ? `@${other.handle}` : "Direct message",
      };
    })
    .sort(
      (left, right) =>
        new Date(right.lastActivityAt).getTime() -
        new Date(left.lastActivityAt).getTime(),
    );
}

function relevantMessages(state: SynqBootstrapState, viewerId: string, conversationIds: Set<string>) {
  return state.messages
    .filter(
      (message) =>
        conversationIds.has(message.conversationId) &&
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

  return SynqBootstrapStateSchema.parse({
    ...cloned,
    currentUserId: viewerId,
    currentDeviceId: deviceId,
    activeSession: buildSessionEnvelope(viewerId, deviceId),
    users: cloned.users,
    devices: cloned.devices,
    conversations,
    messages: relevantMessages(cloned, viewerId, conversationIds),
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
      attachments: parsed.attachments ?? [],
    });

    state.messages.push(message);
    const target = state.conversations.find((item) => item.id === conversationId);
    if (target) {
      target.lastActivityAt = message.createdAt;
      target.lastMessagePreview = message.preview;
    }

    return message;
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

function aiResultFor(action: AIActionRequest["action"], input: string) {
  const compact = input.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Nothing to summarize yet.";
  }

  if (action === "translate") {
    return `Free-mode translation pulse: ${compact.slice(0, 180)}`;
  }

  if (action === "rewrite") {
    return `Invite-only rewrite: ${compact.slice(0, 180)}`;
  }

  if (action === "memory") {
    return `Shared memory card: ${compact.slice(0, 180)}`;
  }

  return `Free-mode summary: ${compact.slice(0, 180)}`;
}

export async function runAiAction(viewer: ViewerIdentity, payload: AIActionRequest) {
  const parsed = AIActionRequestSchema.parse(payload);
  const state = await getBootstrapState(viewer);
  const conversation = state.conversations.find(
    (item) => item.id === parsed.conversationId,
  );

  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  if (conversation.visibility === "e2ee" && parsed.policy !== "local") {
    throw new Error("Cloud AI is disabled for sealed rooms.");
  }

  return {
    mode: conversation.visibility === "e2ee" ? "local" : parsed.policy,
    result: aiResultFor(parsed.action, parsed.input),
  };
}

export async function getReadiness() {
  return {
    ok: true,
    service: "synq-web-api",
    mode: getPool() ? "postgres" : "memory",
    at: nowIso(),
  };
}
