import { EventEmitter } from "node:events";

import {
  createAttachmentKey,
  createAttachmentNonce,
  fingerprintKey,
  generateDeviceKeyPair,
} from "@synq/crypto";
import {
  type AIActionRequest,
  type AttachmentFinalizeRequest,
  type AttachmentObject,
  type AttachmentSignRequest,
  type AttachmentSignResponse,
  type AttachmentUploadRequest,
  type AttachmentUploadResponse,
  type AuditEvent,
  type Channel,
  type ChannelCreateRequest,
  type Conversation,
  type ConversationCreateRequest,
  type Device,
  type DeviceApprovalRequest,
  type DeviceRevokeRequest,
  type DeviceRegistrationRequest,
  type HandleClaimRequest,
  type MessageEnvelope,
  type OnboardingRequest,
  type PasskeyChallenge,
  type PasskeyChallengeRequest,
  type PasskeyCredential,
  type PasskeyVerifyRequest,
  type PasskeyVerifyResponse,
  type Presence,
  type ReadinessResponse,
  type RealtimeEnvelope,
  type SendMessageRequest,
  type Session,
  type SessionRefreshRequest,
  type SynqBootstrapState,
  type Workspace,
  type WorkspaceCreateRequest,
  createDemoState,
} from "@synq/protocol";
import { nanoid } from "nanoid";

import type { AttachmentBlobStorage } from "../storage/blob-storage";
import type { PersistedRuntime, RuntimeStateStorage } from "./state-storage";

interface ChallengeRecord extends PasskeyChallenge {
  expiresAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function parseAuthToken(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function isExpired(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

function decodeUploadPayload(input: string) {
  return Uint8Array.from(Buffer.from(input, "base64"));
}

export class TrustedStore {
  private runtime: PersistedRuntime;
  private loaded = false;
  private emitter = new EventEmitter();
  private challenges = new Map<string, ChallengeRecord>();

  constructor(
    private readonly stateStorage: RuntimeStateStorage,
    private readonly blobStorage: AttachmentBlobStorage,
    seed: PersistedRuntime | null = null,
  ) {
    const seeded = createDemoState();
    this.runtime = seed ?? {
      state: seeded,
      sessions: [seeded.activeSession],
    };
  }

  private get state() {
    return this.runtime.state;
  }

  private get sessions() {
    return this.runtime.sessions;
  }

  private async syncRuntime(force = this.stateStorage.driver === "postgres") {
    if (!this.loaded || force) {
      this.runtime = await this.stateStorage.load(this.runtime);
      this.loaded = true;
    }
  }

  private async persistRuntime() {
    await this.stateStorage.save(this.runtime);
  }

  private audit(event: Omit<AuditEvent, "id" | "createdAt">) {
    const record: AuditEvent = {
      id: `audit_${nanoid(10)}`,
      createdAt: nowIso(),
      ...event,
    };

    this.state.auditEvents.unshift(record);
    return record;
  }

  private getUser(userId: string) {
    const user = this.state.users.find((item) => item.id === userId);

    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }

  private getConversation(conversationId: string, userId: string) {
    const conversation = this.state.conversations.find(
      (item) =>
        item.id === conversationId && item.participantIds.includes(userId),
    );

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    return conversation;
  }

  private getSessionByAccessToken(accessToken: string | null) {
    if (!accessToken) {
      throw new Error("Missing session token.");
    }

    const session = this.sessions.find((item) => item.accessToken === accessToken);

    if (!session || isExpired(session.expiresAt)) {
      throw new Error("Session expired.");
    }

    return session;
  }

  private createSession(
    userId: string,
    deviceId: string,
    scope: Session["scope"],
    pendingApproval: boolean,
  ) {
    const session: Session = {
      id: `session_${nanoid(10)}`,
      userId,
      deviceId,
      scope,
      accessToken: `synq_access_${nanoid(24)}`,
      refreshToken: `synq_refresh_${nanoid(24)}`,
      issuedAt: nowIso(),
      expiresAt: futureIso(45),
      refreshExpiresAt: futureIso(60 * 24 * 14),
      pendingApproval,
    };

    this.runtime.sessions = [
      session,
      ...this.sessions.filter(
        (item) =>
          item.deviceId !== deviceId ||
          item.scope !== scope ||
          item.userId !== userId,
      ),
    ];
    this.state.activeSession = session;
    this.state.currentUserId = userId;
    this.state.currentDeviceId = deviceId;
    return session;
  }

  private redactMessage(message: MessageEnvelope, userId: string) {
    const conversation = this.getConversation(message.conversationId, userId);

    return conversation.visibility === "e2ee"
      ? {
          ...message,
          preview: "Encrypted message",
        }
      : message;
  }

  private filterBootstrap(session: Session): SynqBootstrapState {
    const visibleConversations = this.state.conversations.filter((conversation) =>
      conversation.participantIds.includes(session.userId),
    );
    const visibleConversationIds = new Set(
      visibleConversations.map((item) => item.id),
    );
    const visibleUserIds = new Set<string>([session.userId]);
    const viewer = this.getUser(session.userId);

    for (const conversation of visibleConversations) {
      for (const participantId of conversation.participantIds) {
        visibleUserIds.add(participantId);
      }
    }

    const visibleMessages = this.state.messages
      .filter((message) => visibleConversationIds.has(message.conversationId))
      .map((message) => this.redactMessage(message, session.userId));

    const visibleAttachmentIds = new Set(
      visibleMessages.flatMap((message) =>
        message.attachments.map((item) => item.id),
      ),
    );

    return {
      ...structuredClone(this.state),
      currentUserId: session.userId,
      currentDeviceId: session.deviceId,
      activeSession: session,
      users: this.state.users.filter((user) => visibleUserIds.has(user.id)),
      recoveryMethods: this.state.recoveryMethods.filter(
        (method) =>
          method.value === viewer.linkedEmail || method.value === viewer.linkedPhone,
      ),
      devices: this.state.devices.filter(
        (device) =>
          visibleUserIds.has(device.userId) || device.id === session.deviceId,
      ),
      passkeys: this.state.passkeys.filter(
        (passkey) => passkey.userId === session.userId,
      ),
      deviceApprovals: this.state.deviceApprovals.filter(
        (approval) => approval.userId === session.userId,
      ),
      workspaces: this.state.workspaces,
      workspacePolicies: this.state.workspacePolicies,
      conversations: visibleConversations.map((conversation) =>
        conversation.visibility === "e2ee"
          ? {
              ...conversation,
              lastMessagePreview: "Encrypted message",
            }
          : conversation,
      ),
      channels: this.state.channels.filter((channel) =>
        this.state.workspaces.some((workspace) => workspace.id === channel.workspaceId),
      ),
      attachmentObjects: this.state.attachmentObjects.filter(
        (attachment) =>
          attachment.ownerUserId === session.userId ||
          visibleAttachmentIds.has(attachment.id),
      ),
      messages: visibleMessages,
      auditEvents: this.state.auditEvents.filter(
        (event) => event.userId === session.userId,
      ),
      disappearingJobs: this.state.disappearingJobs.filter((job) =>
        visibleConversationIds.has(job.conversationId),
      ),
    };
  }

  private resolveEffectiveAIPolicy(conversation: Conversation) {
    if (conversation.aiPolicyOverride === "disabled") {
      return "disabled";
    }

    if (conversation.aiPolicyOverride !== "inherit") {
      return conversation.aiPolicyOverride;
    }

    if (conversation.workspaceId) {
      const policy = this.state.workspacePolicies.find(
        (item) => item.workspaceId === conversation.workspaceId,
      );

      if (policy?.aiPolicy === "disabled") {
        return "disabled";
      }

      if (policy?.aiPolicy === "local_only") {
        return "local";
      }
    }

    return conversation.visibility === "e2ee" ? "local" : "ephemeral_cloud";
  }

  async bootstrap(authorization?: string) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    return this.filterBootstrap(session);
  }

  async createPasskeyChallenge(input: PasskeyChallengeRequest): Promise<PasskeyChallenge> {
    await this.syncRuntime();
    const challenge: ChallengeRecord = {
      id: `challenge_${nanoid(10)}`,
      challenge: `synq_challenge_${nanoid(24)}`,
      mode: input.mode,
      label: input.label,
      scope: input.scope,
      createdAt: nowIso(),
      expiresAt: futureIso(5),
    };

    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  async verifyPasskey(input: PasskeyVerifyRequest): Promise<PasskeyVerifyResponse> {
    await this.syncRuntime();
    const challenge = this.challenges.get(input.challengeId);

    if (!challenge || isExpired(challenge.expiresAt) || challenge.mode !== input.mode) {
      throw new Error("Passkey challenge invalid or expired.");
    }

    this.challenges.delete(input.challengeId);

    if (input.mode === "register") {
      const userId = `user_${nanoid(8)}`;
      const deviceId = `dev_${nanoid(8)}`;
      const handle = `pending.${nanoid(6).toLowerCase()}`;
      const user = {
        id: userId,
        name: "New Synq User",
        handle,
        role: "Member",
        avatar: "S",
        bio: "New private signal entering the network.",
        trustState: "watch" as const,
        aiPolicy: "local" as const,
        ghostMode: false,
        onboardingComplete: false,
      };
      const device: Device = {
        id: deviceId,
        userId,
        label: input.label,
        publicKey: input.publicKey,
        passkeyEnabled: true,
        trustState: "approved",
        approvedAt: nowIso(),
        lastSeenAt: nowIso(),
        credentialId: input.credentialId,
        fingerprint: fingerprintKey(input.publicKey),
      };
      const passkey: PasskeyCredential = {
        id: input.credentialId,
        userId,
        deviceId,
        label: input.label,
        publicKey: input.publicKey,
        counter: 1,
        createdAt: nowIso(),
        lastUsedAt: nowIso(),
      };

      this.state.users.unshift(user);
      this.state.devices.unshift(device);
      this.state.passkeys.unshift(passkey);
      this.audit({
        type: "passkey.registered",
        userId,
        deviceId,
        details: {
          label: input.label,
        },
      });

      const session = this.createSession(userId, deviceId, input.scope, false);
      await this.persistRuntime();

      return {
        session,
        user,
        device,
        onboardingRequired: true,
      };
    }

    const passkey = this.state.passkeys.find(
      (item) => item.id === input.credentialId,
    );

    if (!passkey) {
      throw new Error("Unknown passkey.");
    }

    const device = this.state.devices.find((item) => item.id === passkey.deviceId);

    if (!device || device.trustState === "revoked") {
      throw new Error("Device unavailable.");
    }

    if (passkey.publicKey !== input.publicKey) {
      this.audit({
        type: "security.passkey_assertion_mismatch",
        userId: passkey.userId,
        deviceId: device.id,
        details: {
          credentialId: input.credentialId,
        },
      });
      await this.persistRuntime();
      throw new Error("Passkey assertion invalid.");
    }

    if (device.label !== input.label) {
      this.audit({
        type: "security.passkey_label_mismatch",
        userId: passkey.userId,
        deviceId: device.id,
        details: {
          expected: device.label,
          received: input.label,
        },
      });
    }

    passkey.lastUsedAt = nowIso();
    device.lastSeenAt = nowIso();

    const session = this.createSession(
      passkey.userId,
      device.id,
      input.scope,
      device.trustState === "pending",
    );

    this.audit({
      type: "passkey.authenticated",
      userId: passkey.userId,
      deviceId: device.id,
      details: {
        label: input.label,
      },
    });
    await this.persistRuntime();

    return {
      session,
      user: this.getUser(passkey.userId),
      device,
      onboardingRequired: !this.getUser(passkey.userId).onboardingComplete,
    };
  }

  async refreshSession(input: SessionRefreshRequest) {
    await this.syncRuntime();
    const current = this.sessions.find(
      (item) => item.refreshToken === input.refreshToken,
    );

    if (!current) {
      throw new Error("Refresh token invalid.");
    }

    if (isExpired(current.refreshExpiresAt)) {
      throw new Error("Refresh token expired.");
    }

    this.runtime.sessions = this.sessions.filter((item) => item.id !== current.id);
    const session = this.createSession(
      current.userId,
      current.deviceId,
      current.scope,
      current.pendingApproval,
    );
    await this.persistRuntime();
    return session;
  }

  async completeOnboarding(authorization: string | undefined, input: OnboardingRequest) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const user = this.getUser(session.userId);

    if (
      this.state.users.some(
        (item) => item.handle === input.handle && item.id !== session.userId,
      )
    ) {
      throw new Error("Handle already claimed.");
    }

    user.name = input.name;
    user.handle = input.handle;
    user.ghostMode = input.ghostMode;
    user.onboardingComplete = true;
    user.linkedEmail = input.recoveryMethods.find((item) => item.kind === "email")?.value;
    user.linkedPhone = input.recoveryMethods.find((item) => item.kind === "phone")?.value;

    this.state.recoveryMethods = this.state.recoveryMethods.filter(
      (method) =>
        method.value !== user.linkedEmail && method.value !== user.linkedPhone,
    );
    this.state.recoveryMethods.unshift(
      ...input.recoveryMethods.map((method) => ({
        id: `recovery_${nanoid(8)}`,
        kind: method.kind,
        value: method.value,
      })),
    );

    this.audit({
      type: "user.onboarded",
      userId: session.userId,
      deviceId: session.deviceId,
      details: {
        handle: input.handle,
      },
    });
    await this.persistRuntime();

    return user;
  }

  async claimHandle(authorization: string | undefined, input: HandleClaimRequest) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));

    if (
      this.state.users.some(
        (item) => item.handle === input.handle && item.id !== session.userId,
      )
    ) {
      throw new Error("Handle already claimed.");
    }

    const user = this.getUser(session.userId);
    user.handle = input.handle;
    await this.persistRuntime();

    return user;
  }

  async listDevices(authorization: string | undefined) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    return this.state.devices.filter((device) => device.userId === session.userId);
  }

  async approveDevice(authorization: string | undefined, input: DeviceApprovalRequest) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const device = this.state.devices.find(
      (item) => item.id === input.deviceId && item.userId === session.userId,
    );

    if (!device) {
      throw new Error("Device not found.");
    }

    device.trustState = "approved";
    device.approvedAt = nowIso();
    this.runtime.sessions = this.sessions.map((item) =>
      item.deviceId === device.id
        ? {
            ...item,
            pendingApproval: false,
          }
        : item,
    );

    const existing = this.state.deviceApprovals.find(
      (item) => item.deviceId === device.id,
    );

    if (existing) {
      existing.status = "approved";
      existing.approvedAt = nowIso();
      existing.approvedByDeviceId = session.deviceId;
    } else {
      this.state.deviceApprovals.unshift({
        id: `approval_${nanoid(10)}`,
        userId: session.userId,
        deviceId: device.id,
        status: "approved",
        requestedAt: nowIso(),
        approvedAt: nowIso(),
        approvedByDeviceId: session.deviceId,
      });
    }

    this.audit({
      type: "device.approved",
      userId: session.userId,
      deviceId: device.id,
      details: {
        approvedBy: session.deviceId,
      },
    });
    await this.persistRuntime();

    return device;
  }

  async revokeDevice(authorization: string | undefined, input: DeviceRevokeRequest) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const device = this.state.devices.find(
      (item) => item.id === input.deviceId && item.userId === session.userId,
    );

    if (!device) {
      throw new Error("Device not found.");
    }

    device.trustState = "revoked";
    device.revokedAt = nowIso();
    this.runtime.sessions = this.sessions.map((item) =>
      item.deviceId === device.id
        ? {
            ...item,
            expiresAt: nowIso(),
            refreshExpiresAt: nowIso(),
          }
        : item,
    );

    const existing = this.state.deviceApprovals.find(
      (item) => item.deviceId === device.id,
    );
    if (existing) {
      existing.status = "revoked";
    }

    this.audit({
      type: "device.revoked",
      userId: session.userId,
      deviceId: device.id,
      details: {},
    });
    await this.persistRuntime();

    return device;
  }

  async registerDevice(authorization: string | undefined, input: DeviceRegistrationRequest): Promise<Device> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const keyPair = generateDeviceKeyPair();
    const device: Device = {
      id: `dev_${nanoid(8)}`,
      userId: session.userId,
      label: input.label,
      publicKey: keyPair.publicKey,
      passkeyEnabled: input.passkeyEnabled,
      trustState: "pending",
      lastSeenAt: nowIso(),
      fingerprint: fingerprintKey(keyPair.publicKey),
    };

    this.state.devices.unshift(device);
    this.state.deviceApprovals.unshift({
      id: `approval_${nanoid(10)}`,
      userId: session.userId,
      deviceId: device.id,
      status: "pending",
      requestedAt: nowIso(),
    });

    this.audit({
      type: "device.requested",
      userId: session.userId,
      deviceId: device.id,
      details: {
        label: input.label,
      },
    });
    await this.persistRuntime();

    return device;
  }

  async listWorkspaces(authorization: string | undefined) {
    await this.syncRuntime();
    this.getSessionByAccessToken(parseAuthToken(authorization));
    return structuredClone(this.state.workspaces);
  }

  async createWorkspace(authorization: string | undefined, input: WorkspaceCreateRequest): Promise<Workspace> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const workspaceId = `ws_${nanoid(8)}`;
    const policyId = `policy_${nanoid(8)}`;
    this.state.workspacePolicies.unshift({
      id: policyId,
      workspaceId,
      aiPolicy: input.aiPolicy === "local" ? "local_only" : "managed_opt_in",
      inviteOnly: true,
      retentionDays: 90,
    });
    const workspace: Workspace = {
      id: workspaceId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      ambientScene: input.ambientScene,
      memberCount: 1,
      aiPolicy: input.aiPolicy,
      policyId,
    };

    this.state.workspaces.unshift(workspace);
    this.audit({
      type: "workspace.created",
      userId: session.userId,
      deviceId: session.deviceId,
      details: {
        workspaceId,
      },
    });
    await this.persistRuntime();
    return workspace;
  }

  async listConversations(authorization: string | undefined) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    return this.filterBootstrap(session).conversations;
  }

  async createConversation(authorization: string | undefined, input: ConversationCreateRequest): Promise<Conversation> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const protection =
      input.kind === "workspace_room" || input.kind === "creator_channel"
        ? "managed_plaintext"
        : input.kind === "private_group"
          ? "sender_key"
          : "ratcheted";
    const conversation: Conversation = {
      id: `conv_${nanoid(8)}`,
      title: input.title,
      subtitle: input.subtitle,
      kind: input.kind,
      visibility: input.visibility,
      participantIds: Array.from(new Set([session.userId, ...input.participantIds])),
      unreadCount: 0,
      disappearingSeconds: input.disappearingSeconds,
      lastActivityAt: nowIso(),
      lastMessagePreview:
        input.visibility === "e2ee"
          ? "Encrypted channel initialized."
          : "Conversation created.",
      messageProtection: protection,
      aiPolicyOverride: input.visibility === "e2ee" ? "local" : "inherit",
    };

    this.state.conversations.unshift(conversation);
    await this.persistRuntime();
    return conversation;
  }

  async listChannels(authorization: string | undefined) {
    await this.syncRuntime();
    this.getSessionByAccessToken(parseAuthToken(authorization));
    return structuredClone(this.state.channels);
  }

  async createChannel(authorization: string | undefined, input: ChannelCreateRequest): Promise<Channel> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const channel: Channel = {
      id: `channel_${nanoid(8)}`,
      workspaceId: input.workspaceId,
      name: input.name,
      purpose: input.purpose,
      kind: input.kind,
      visibility: input.visibility,
      unreadCount: 0,
    };

    this.state.channels.unshift(channel);
    this.audit({
      type: "channel.created",
      userId: session.userId,
      deviceId: session.deviceId,
      details: {
        channelId: channel.id,
      },
    });
    await this.persistRuntime();
    return channel;
  }

  async listMessages(authorization: string | undefined, conversationId: string) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    this.getConversation(conversationId, session.userId);

    return this.state.messages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => this.redactMessage(message, session.userId));
  }

  async sendMessage(authorization: string | undefined, input: SendMessageRequest): Promise<MessageEnvelope> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const conversation = this.getConversation(input.conversationId, session.userId);

    if (conversation.visibility === "e2ee" && input.messageProtection === "managed_plaintext") {
      throw new Error("Sealed rooms cannot accept managed plaintext messages.");
    }

    const attachments = input.attachments.map((attachment) => {
      const committed = this.state.attachmentObjects.find(
        (item) =>
          item.id === attachment.id &&
          item.keyId === attachment.keyId &&
          item.status === "committed",
      );

      if (!committed) {
        throw new Error("Attachment must be finalized before message send.");
      }

      return attachment;
    });

    const serverPreview =
      conversation.visibility === "e2ee"
        ? "Encrypted message"
        : input.preview || "Message received.";
    const message: MessageEnvelope = {
      id: `msg_${nanoid(10)}`,
      clientId: input.clientId,
      conversationId: input.conversationId,
      senderId: session.userId,
      ciphertext: input.ciphertext,
      preview: serverPreview,
      createdAt: nowIso(),
      status: "sent",
      messageProtection: input.messageProtection,
      mentions: input.mentions,
      replyToId: input.replyToId,
      attachments,
    };

    this.state.messages.push(message);
    conversation.lastActivityAt = message.createdAt;
    conversation.lastMessagePreview = serverPreview;

    if (conversation.disappearingSeconds) {
      this.state.disappearingJobs.push({
        id: `job_${nanoid(8)}`,
        messageId: message.id,
        conversationId: conversation.id,
        deleteAt: futureIso(Math.ceil(conversation.disappearingSeconds / 60)),
        status: "scheduled",
      });
    }

    await this.persistRuntime();

    this.publish({
      type: "message.ack",
      payload: {
        conversationId: input.conversationId,
        message,
      },
    });

    return this.redactMessage(message, session.userId);
  }

  async signAttachment(
    authorization: string | undefined,
    input: AttachmentSignRequest,
  ): Promise<AttachmentSignResponse> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const keyId = `attk_${nanoid(8)}`;
    const attachmentId = `att_${nanoid(8)}`;
    const object: AttachmentObject = {
      id: attachmentId,
      ownerUserId: session.userId,
      keyId,
      status: "pending",
      uploadUrl: `/attachments/${attachmentId}/upload`,
      encryptedUrl: `/attachments/${attachmentId}/content`,
      createdAt: nowIso(),
    };

    this.state.attachmentObjects.unshift(object);
    this.audit({
      type: "attachment.signed",
      userId: session.userId,
      deviceId: session.deviceId,
      details: {
        attachmentId,
        fileName: input.fileName,
      },
    });
    await this.persistRuntime();

    return {
      attachmentId,
      keyId,
      uploadUrl: object.uploadUrl,
      encryptedUrl: object.encryptedUrl!,
      nonce: createAttachmentNonce(),
      secret: createAttachmentKey(),
      status: object.status,
    };
  }

  async uploadAttachment(
    authorization: string | undefined,
    attachmentId: string,
    input: AttachmentUploadRequest,
  ): Promise<AttachmentUploadResponse> {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const object = this.state.attachmentObjects.find(
      (item) =>
        item.id === attachmentId && item.ownerUserId === session.userId,
    );

    if (!object) {
      throw new Error("Attachment object not found.");
    }

    const payload = decodeUploadPayload(input.encryptedBodyBase64);
    if (!payload.byteLength) {
      throw new Error("Attachment payload empty.");
    }

    const written = await this.blobStorage.write(attachmentId, payload);
    object.status = "uploaded";
    object.uploadedAt = nowIso();
    object.byteLength = written.byteLength;
    object.sha256 = written.sha256;

    this.audit({
      type: "attachment.uploaded",
      userId: session.userId,
      deviceId: session.deviceId,
      details: {
        attachmentId,
        sha256: written.sha256,
      },
    });
    await this.persistRuntime();

    return {
      attachmentId,
      status: object.status,
      byteLength: written.byteLength,
      sha256: written.sha256,
    };
  }

  async finalizeAttachment(authorization: string | undefined, input: AttachmentFinalizeRequest) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const object = this.state.attachmentObjects.find(
      (item) =>
        item.id === input.attachmentId &&
        item.keyId === input.keyId &&
        item.ownerUserId === session.userId,
    );

    if (!object) {
      throw new Error("Attachment object not found.");
    }

    if (object.status !== "uploaded") {
      throw new Error("Attachment upload must complete before finalize.");
    }

    object.status = "committed";
    object.encryptedUrl = input.encryptedUrl;
    object.committedAt = nowIso();

    this.audit({
      type: "attachment.committed",
      userId: session.userId,
      deviceId: session.deviceId,
      details: {
        attachmentId: object.id,
      },
    });
    await this.persistRuntime();

    return object;
  }

  async downloadAttachment(authorization: string | undefined, attachmentId: string) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const object = this.state.attachmentObjects.find((item) => item.id === attachmentId);

    if (!object || object.status !== "committed") {
      throw new Error("Attachment object not found.");
    }

    const attachmentMessage = this.state.messages.find((message) =>
      message.attachments.some((attachment) => attachment.id === attachmentId),
    );

    const isOwner = object.ownerUserId === session.userId;
    const isConversationParticipant =
      !!attachmentMessage &&
      this.getConversation(attachmentMessage.conversationId, session.userId);

    if (!isOwner && !isConversationParticipant) {
      throw new Error("Attachment not found.");
    }

    const attachment = attachmentMessage?.attachments.find(
      (item) => item.id === attachmentId,
    );
    if (!attachment) {
      throw new Error("Attachment not found.");
    }

    return {
      attachment,
      payload: await this.blobStorage.read(attachmentId),
    };
  }

  async discoverContacts(authorization: string | undefined, query?: string) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const normalized = query?.toLowerCase();

    return this.state.users.filter((user) => {
      if (user.id === session.userId) {
        return false;
      }

      return !normalized
        ? true
        : user.name.toLowerCase().includes(normalized) ||
            user.handle.toLowerCase().includes(normalized);
    });
  }

  async aiAction(authorization: string | undefined, input: AIActionRequest) {
    await this.syncRuntime();
    const session = this.getSessionByAccessToken(parseAuthToken(authorization));
    const conversation = this.getConversation(input.conversationId, session.userId);
    const effectivePolicy = this.resolveEffectiveAIPolicy(conversation);

    if (effectivePolicy === "disabled") {
      throw new Error("AI is disabled for this surface.");
    }

    if (conversation.visibility === "e2ee" && input.policy !== "local") {
      throw new Error("Cloud AI is forbidden for sealed rooms.");
    }

    if (effectivePolicy === "local" && input.policy === "ephemeral_cloud") {
      throw new Error("Workspace policy requires local AI only.");
    }

    const messages = this.state.messages
      .filter((message) => message.conversationId === input.conversationId)
      .map((message) =>
        conversation.visibility === "e2ee" ? "Encrypted message" : message.preview,
      );

    const latest = messages.slice(-4);

    if (input.action === "summarize") {
      return {
        mode: input.policy,
        result: `Summary: ${latest.join(" | ") || "No visible managed history."}`,
      };
    }

    if (input.action === "translate") {
      return {
        mode: input.policy,
        result: `Translation stub: ${input.input}`,
      };
    }

    if (input.action === "memory") {
      return {
        mode: input.policy,
        result: `Memory card: ${latest[0] ?? "No recent history"} -> ${latest.at(-1) ?? "No current signal"}`,
      };
    }

    return {
      mode: input.policy,
      result: `Rewrite suggestion: ${input.input.slice(0, 140)}`,
    };
  }

  async updatePresence(userId: string, state: Presence["state"], scene: string) {
    await this.syncRuntime();
    const existing = this.state.presence.find((entry) => entry.userId === userId);

    if (existing) {
      existing.state = state;
      existing.scene = scene;
      existing.updatedAt = nowIso();
    } else {
      this.state.presence.push({
        userId,
        state,
        scene,
        updatedAt: nowIso(),
      });
    }

    await this.persistRuntime();
    this.publish({
      type: "presence.update",
      payload: {
        userId,
        state,
        scene,
      },
    });
  }

  async runMaintenance() {
    await this.syncRuntime();
    let changed = false;
    const now = Date.now();
    const toDelete = new Set(
      this.state.disappearingJobs
        .filter((job) => new Date(job.deleteAt).getTime() <= now)
        .map((job) => job.messageId),
    );

    if (toDelete.size) {
      changed = true;
      this.state.messages = this.state.messages.filter(
        (message) => !toDelete.has(message.id),
      );
      this.state.disappearingJobs = this.state.disappearingJobs.map((job) =>
        toDelete.has(job.messageId) ? { ...job, status: "processed" } : job,
      );
    }

    const onlineThreshold = 10 * 60_000;
    this.state.presence = this.state.presence.map((presence) => {
      if (Date.now() - new Date(presence.updatedAt).getTime() > onlineThreshold) {
        changed = true;
        return {
          ...presence,
          state: "offline",
        };
      }

      return presence;
    });

    this.state.attachmentObjects = this.state.attachmentObjects.map((attachment) => {
      if (
        attachment.status === "pending" &&
        Date.now() - new Date(attachment.createdAt).getTime() > 60 * 60_000
      ) {
        changed = true;
        return {
          ...attachment,
          status: "expired",
        };
      }

      return attachment;
    });

    const activeSessions = this.sessions.filter(
      (session) => !isExpired(session.refreshExpiresAt),
    );
    if (activeSessions.length !== this.sessions.length) {
      changed = true;
      this.runtime.sessions = activeSessions;
    }

    if (changed) {
      await this.persistRuntime();
    }
  }

  async health(): Promise<ReadinessResponse> {
    await this.syncRuntime(false);
    const stateHealth = await this.stateStorage.health();
    const blobHealth = await this.blobStorage.health();

    return {
      ok: stateHealth.ok && blobHealth.ok,
      service: "synq-api",
      driver: stateHealth.driver,
      objectStorage: blobHealth.driver,
      at: nowIso(),
    };
  }

  publish(event: RealtimeEnvelope) {
    this.emitter.emit("realtime", event);
  }

  onRealtime(listener: (event: RealtimeEnvelope) => void) {
    this.emitter.on("realtime", listener);
    return () => {
      this.emitter.off("realtime", listener);
    };
  }

  async close() {
    await this.stateStorage.close();
  }
}
