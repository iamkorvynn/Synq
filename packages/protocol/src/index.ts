import { z } from "zod";

export const conversationKindValues = [
  "dm",
  "private_group",
  "workspace_room",
  "creator_channel",
] as const;
export const visibilityValues = [
  "e2ee",
  "managed_private",
  "managed_broadcast",
] as const;

export const trustStateValues = ["verified", "watch", "ghost"] as const;
export const profileVisibilityValues = ["full", "handle_only"] as const;
export const deviceTrustStateValues = [
  "pending",
  "approved",
  "revoked",
  "compromised",
] as const;
export const sessionScopeValues = ["web", "pwa", "desktop", "mobile"] as const;
export const messageProtectionValues = [
  "ratcheted",
  "sender_key",
  "managed_plaintext",
] as const;
export const directConversationStateValues = ["implicit", "started"] as const;
export const attachmentStatusValues = [
  "pending",
  "uploaded",
  "committed",
  "expired",
] as const;
export const messageStatusValues = ["queued", "sent", "read"] as const;
export const deviceApprovalStatusValues = [
  "pending",
  "approved",
  "revoked",
] as const;
export const jobStatusValues = ["scheduled", "processed"] as const;
export const passkeyModeValues = ["register", "authenticate"] as const;
export const realtimeEventValues = [
  "session.ready",
  "presence.update",
  "message.send",
  "message.ack",
  "message.read",
  "typing.update",
  "conversation.patch",
  "channel.publish",
  "ai.result",
] as const;

export type ConversationKind = (typeof conversationKindValues)[number];
export type Visibility = (typeof visibilityValues)[number];

export type TrustState = (typeof trustStateValues)[number];
export type ProfileVisibility = (typeof profileVisibilityValues)[number];
export type DeviceTrustState = (typeof deviceTrustStateValues)[number];
export type SessionScope = (typeof sessionScopeValues)[number];
export type MessageProtection = (typeof messageProtectionValues)[number];
export type DirectConversationState =
  (typeof directConversationStateValues)[number];
export type AttachmentStatus = (typeof attachmentStatusValues)[number];
export type MessageStatus = (typeof messageStatusValues)[number];
export type DeviceApprovalStatus = (typeof deviceApprovalStatusValues)[number];
export type JobStatus = (typeof jobStatusValues)[number];
export type PasskeyMode = (typeof passkeyModeValues)[number];
export type RealtimeEventType = (typeof realtimeEventValues)[number];

export const ConversationKindSchema = z.enum(conversationKindValues);
export const VisibilitySchema = z.enum(visibilityValues);

export const TrustStateSchema = z.enum(trustStateValues);
export const ProfileVisibilitySchema = z.enum(profileVisibilityValues);
export const DeviceTrustStateSchema = z.enum(deviceTrustStateValues);
export const SessionScopeSchema = z.enum(sessionScopeValues);
export const MessageProtectionSchema = z.enum(messageProtectionValues);
export const DirectConversationStateSchema = z.enum(directConversationStateValues);
export const AttachmentStatusSchema = z.enum(attachmentStatusValues);
export const MessageStatusSchema = z.enum(messageStatusValues);
export const DeviceApprovalStatusSchema = z.enum(deviceApprovalStatusValues);
export const JobStatusSchema = z.enum(jobStatusValues);
export const PasskeyModeSchema = z.enum(passkeyModeValues);
export const RealtimeEventTypeSchema = z.enum(realtimeEventValues);

export const RecoveryMethodSchema = z.object({
  id: z.string(),
  kind: z.enum(["email", "phone"]),
  value: z.string(),
  verifiedAt: z.string().optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  role: z.string(),
  avatar: z.string(),
  bio: z.string(),
  trustState: TrustStateSchema,

  ghostMode: z.boolean(),
  profileVisibility: ProfileVisibilitySchema.default("full"),
  hiddenAvatar: z.boolean().default(false),
  privateDiscovery: z.boolean().default(false),
  onboardingComplete: z.boolean(),
  linkedPhone: z.string().optional(),
  linkedEmail: z.string().email().optional(),
});

export const DeviceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  label: z.string(),
  publicKey: z.string(),
  passkeyEnabled: z.boolean(),
  trustState: DeviceTrustStateSchema,
  approvedAt: z.string().optional(),
  lastSeenAt: z.string(),
  revokedAt: z.string().optional(),
  credentialId: z.string().optional(),
  fingerprint: z.string(),
});

export const PasskeyCredentialSchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceId: z.string(),
  label: z.string(),
  publicKey: z.string(),
  counter: z.number(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceId: z.string(),
  scope: SessionScopeSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  refreshExpiresAt: z.string(),
  pendingApproval: z.boolean(),
});

export const DeviceApprovalSchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceId: z.string(),
  status: DeviceApprovalStatusSchema,
  requestedAt: z.string(),
  approvedAt: z.string().optional(),
  approvedByDeviceId: z.string().optional(),
});

export const WorkspacePolicySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),

  inviteOnly: z.boolean(),
  retentionDays: z.number(),
});

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  ambientScene: z.string(),
  memberCount: z.number(),

  policyId: z.string(),
});

export const CircleSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: VisibilitySchema,
  memberCount: z.number(),
});

export const ChannelSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  purpose: z.string(),
  kind: ConversationKindSchema,
  visibility: VisibilitySchema,
  unreadCount: z.number(),
});

export const AttachmentObjectSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  keyId: z.string(),
  status: AttachmentStatusSchema,
  uploadUrl: z.string(),
  encryptedUrl: z.string().optional(),
  createdAt: z.string(),
  uploadedAt: z.string().optional(),
  committedAt: z.string().optional(),
  byteLength: z.number().optional(),
  sha256: z.string().optional(),
});

export const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  keyId: z.string(),
  nonce: z.string(),
  status: AttachmentStatusSchema,
  encryptedUrl: z.string().optional(),
});

export const MessageReactionSchema = z.object({
  emoji: z.string(),
  userId: z.string(),
  createdAt: z.string(),
});

export const MessageEnvelopeSchema = z.object({
  id: z.string(),
  clientId: z.string().optional(),
  conversationId: z.string(),
  senderId: z.string(),
  ciphertext: z.string(),
  preview: z.string(),
  createdAt: z.string(),
  status: MessageStatusSchema,
  messageProtection: MessageProtectionSchema,
  mentions: z.array(z.string()).default([]),
  replyToId: z.string().optional(),
  reactions: z.array(MessageReactionSchema).default([]),
  editedAt: z.string().optional(),
  deletedAt: z.string().optional(),
  attachments: z.array(AttachmentSchema).default([]),
});

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  kind: ConversationKindSchema,
  visibility: VisibilitySchema,
  participantIds: z.array(z.string()),
  unreadCount: z.number(),
  disappearingSeconds: z.number().optional(),
  lastActivityAt: z.string(),
  lastMessagePreview: z.string(),
  messageProtection: MessageProtectionSchema,

  ownerUserId: z.string().optional(),
  joinCode: z.string().optional(),
  typingUserIds: z.array(z.string()).default([]),
  workspaceId: z.string().optional(),
  directState: DirectConversationStateSchema.optional(),
});

export const PresenceSchema = z.object({
  userId: z.string(),
  state: z.enum(["online", "focus", "offline"]),
  scene: z.string(),
  updatedAt: z.string(),
});

export const AuditEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  userId: z.string().optional(),
  deviceId: z.string().optional(),
  conversationId: z.string().optional(),
  createdAt: z.string(),
  details: z.record(z.string()),
});

export const DisappearingMessageJobSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  deleteAt: z.string(),
  status: JobStatusSchema,
});

export const PinnedMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  pinnedByUserId: z.string(),
  createdAt: z.string(),
});

export const ConversationMembershipSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  joinedAt: z.string(),
  lastReadAt: z.string().optional(),
  unreadCount: z.number(),
});

export const TypingIndicatorSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
});

export const BlockRecordSchema = z.object({
  id: z.string(),
  blockerUserId: z.string(),
  blockedUserId: z.string(),
  createdAt: z.string(),
});

export const ReportRecordSchema = z.object({
  id: z.string(),
  reporterUserId: z.string(),
  targetUserId: z.string().optional(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  reason: z.string(),
  note: z.string().optional(),
  createdAt: z.string(),
});

export const ModerationLogSchema = z.object({
  id: z.string(),
  actorUserId: z.string(),
  targetUserId: z.string().optional(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  action: z.string(),
  createdAt: z.string(),
  details: z.record(z.string()),
});

export const SynqBootstrapStateSchema = z.object({
  currentUserId: z.string(),
  currentDeviceId: z.string(),
  activeSession: SessionSchema,
  users: z.array(UserSchema),
  recoveryMethods: z.array(RecoveryMethodSchema),
  devices: z.array(DeviceSchema),
  passkeys: z.array(PasskeyCredentialSchema),
  deviceApprovals: z.array(DeviceApprovalSchema),
  workspacePolicies: z.array(WorkspacePolicySchema),
  workspaces: z.array(WorkspaceSchema),
  circles: z.array(CircleSchema),
  conversations: z.array(ConversationSchema),
  channels: z.array(ChannelSchema),
  attachmentObjects: z.array(AttachmentObjectSchema),
  messages: z.array(MessageEnvelopeSchema),
  pinnedMessages: z.array(PinnedMessageSchema),
  conversationMemberships: z.array(ConversationMembershipSchema),
  typingIndicators: z.array(TypingIndicatorSchema),
  blockRecords: z.array(BlockRecordSchema),
  reports: z.array(ReportRecordSchema),
  moderationLogs: z.array(ModerationLogSchema),
  presence: z.array(PresenceSchema),
  auditEvents: z.array(AuditEventSchema),
  disappearingJobs: z.array(DisappearingMessageJobSchema),
});

export type RecoveryMethod = z.infer<typeof RecoveryMethodSchema>;
export type User = z.infer<typeof UserSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type PasskeyCredential = z.infer<typeof PasskeyCredentialSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type DeviceApproval = z.infer<typeof DeviceApprovalSchema>;
export type WorkspacePolicy = z.infer<typeof WorkspacePolicySchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Circle = z.infer<typeof CircleSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type AttachmentObject = z.infer<typeof AttachmentObjectSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type MessageReaction = z.infer<typeof MessageReactionSchema>;
export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Presence = z.infer<typeof PresenceSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type DisappearingMessageJob = z.infer<typeof DisappearingMessageJobSchema>;
export type PinnedMessage = z.infer<typeof PinnedMessageSchema>;
export type ConversationMembership = z.infer<typeof ConversationMembershipSchema>;
export type TypingIndicator = z.infer<typeof TypingIndicatorSchema>;
export type BlockRecord = z.infer<typeof BlockRecordSchema>;
export type ReportRecord = z.infer<typeof ReportRecordSchema>;
export type ModerationLog = z.infer<typeof ModerationLogSchema>;
export type SynqBootstrapState = z.infer<typeof SynqBootstrapStateSchema>;

export const DeviceRegistrationRequestSchema = z.object({
  label: z.string().min(2),
  passkeyEnabled: z.boolean().default(true),
});

export const HandleClaimRequestSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_.-]+$/),
});

export const WorkspaceCreateRequestSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().min(4),
  ambientScene: z.string().min(2),

});

export const ConversationCreateRequestSchema = z.object({
  title: z.string().min(2),
  subtitle: z.string().min(2),
  kind: ConversationKindSchema,
  visibility: VisibilitySchema,
  participantIds: z.array(z.string()).default([]),
  participantHandles: z.array(z.string()).default([]),
  workspaceId: z.string().optional(),
  disappearingSeconds: z.number().optional(),
});

export const ConversationJoinRequestSchema = z.object({
  code: z.string().trim().min(4).max(16),
});

export const DirectConversationRequestSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_.-]+$/),
});

export const ChannelCreateRequestSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(2),
  purpose: z.string().min(2),
  kind: z.union([z.literal("workspace_room"), z.literal("creator_channel")]),
  visibility: VisibilitySchema,
});

export const AttachmentSignRequestSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().positive(),
});

export const AttachmentFinalizeRequestSchema = z.object({
  attachmentId: z.string(),
  keyId: z.string(),
  encryptedUrl: z
    .string()
    .url()
    .or(z.string().startsWith("encrypted://"))
    .or(z.string().startsWith("/attachments/"))
    .or(z.string().startsWith("/api/synq/attachments/")),
});

export const AttachmentUploadRequestSchema = z.object({
  encryptedBodyBase64: z.string().min(1),
});

export const AttachmentUploadResponseSchema = z.object({
  attachmentId: z.string(),
  status: AttachmentStatusSchema,
  byteLength: z.number(),
  sha256: z.string(),
});

export const AttachmentSignResponseSchema = z.object({
  attachmentId: z.string(),
  keyId: z.string(),
  uploadUrl: z.string(),
  encryptedUrl: z.string(),
  nonce: z.string(),
  secret: z.string(),
  status: AttachmentStatusSchema,
});

export const ReadinessResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("synq-api"),
  driver: z.string(),
  objectStorage: z.string(),
  at: z.string(),
});


export const DiscoveryQuerySchema = z.object({
  query: z.string().optional(),
});

export const ProfileUpdateRequestSchema = z.object({
  name: z.string().min(2),
  bio: z.string().max(180),
  avatar: z.string().min(1).max(2),
  ghostMode: z.boolean(),
  profileVisibility: ProfileVisibilitySchema,
  hiddenAvatar: z.boolean(),
  privateDiscovery: z.boolean(),
});

export const SendMessageRequestSchema = z.object({
  clientId: z.string().optional(),
  conversationId: z.string(),
  ciphertext: z.string(),
  preview: z.string().optional().default(""),
  mentions: z.array(z.string()).default([]),
  replyToId: z.string().optional(),
  messageProtection: MessageProtectionSchema,
  attachments: z.array(AttachmentSchema).default([]),
});

export const MessageReactionRequestSchema = z.object({
  emoji: z.string().min(1).max(8),
});

export const MessagePinRequestSchema = z.object({
  pinned: z.boolean().default(true),
});

export const MessageUpdateRequestSchema = z.object({
  preview: z.string().trim().min(1).max(500).optional(),
  ciphertext: z.string().optional(),
  deleted: z.boolean().optional(),
});

export const ConversationTypingRequestSchema = z.object({
  isTyping: z.boolean(),
});

export const PasskeyChallengeRequestSchema = z.object({
  mode: PasskeyModeSchema,
  scope: SessionScopeSchema.default("web"),
  label: z.string().min(2).max(40),
});

export const PasskeyChallengeSchema = z.object({
  id: z.string(),
  challenge: z.string(),
  mode: PasskeyModeSchema,
  label: z.string(),
  scope: SessionScopeSchema,
  createdAt: z.string(),
});

export const PasskeyVerifyRequestSchema = z.object({
  challengeId: z.string(),
  mode: PasskeyModeSchema,
  label: z.string().min(2).max(40),
  credentialId: z.string().min(8),
  publicKey: z.string().min(8),
  scope: SessionScopeSchema.default("web"),
});

export const PasskeyVerifyResponseSchema = z.object({
  session: SessionSchema,
  user: UserSchema,
  device: DeviceSchema,
  onboardingRequired: z.boolean(),
});

export const SessionRefreshRequestSchema = z.object({
  refreshToken: z.string(),
});

export const OnboardingRequestSchema = z.object({
  name: z.string().min(2),
  handle: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_.-]+$/),
  ghostMode: z.boolean(),
  profileVisibility: ProfileVisibilitySchema.default("handle_only"),
  hiddenAvatar: z.boolean().default(false),
  privateDiscovery: z.boolean().default(false),
  recoveryMethods: z
    .array(
      z.object({
        kind: z.enum(["email", "phone"]),
        value: z.string(),
      }),
    )
    .default([]),
});

export const DeviceApprovalRequestSchema = z.object({
  deviceId: z.string(),
});

export const DeviceRevokeRequestSchema = z.object({
  deviceId: z.string(),
});

export const DeviceLabelUpdateRequestSchema = z.object({
  deviceId: z.string(),
  label: z.string().min(2).max(40),
});

export const BlockUserRequestSchema = z.object({
  targetUserId: z.string(),
});

export const ReportCreateRequestSchema = z.object({
  targetUserId: z.string().optional(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  reason: z.string().min(3).max(120),
  note: z.string().max(280).optional(),
});

export const AccountDeleteRequestSchema = z.object({
  confirm: z.literal("DELETE MY ACCOUNT"),
});

export const RealtimeEnvelopeSchema = z.object({
  type: RealtimeEventTypeSchema,
  payload: z.record(z.any()),
});

export type DeviceRegistrationRequest = z.infer<
  typeof DeviceRegistrationRequestSchema
>;
export type HandleClaimRequest = z.infer<typeof HandleClaimRequestSchema>;
export type WorkspaceCreateRequest = z.infer<typeof WorkspaceCreateRequestSchema>;
export type ConversationCreateRequest = z.infer<
  typeof ConversationCreateRequestSchema
>;
export type ConversationJoinRequest = z.infer<
  typeof ConversationJoinRequestSchema
>;
export type DirectConversationRequest = z.infer<
  typeof DirectConversationRequestSchema
>;
export type ChannelCreateRequest = z.infer<typeof ChannelCreateRequestSchema>;
export type AttachmentSignRequest = z.infer<typeof AttachmentSignRequestSchema>;
export type AttachmentFinalizeRequest = z.infer<
  typeof AttachmentFinalizeRequestSchema
>;
export type AttachmentUploadRequest = z.infer<
  typeof AttachmentUploadRequestSchema
>;
export type AttachmentUploadResponse = z.infer<
  typeof AttachmentUploadResponseSchema
>;
export type AttachmentSignResponse = z.infer<
  typeof AttachmentSignResponseSchema
>;

export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type MessageReactionRequest = z.infer<typeof MessageReactionRequestSchema>;
export type MessagePinRequest = z.infer<typeof MessagePinRequestSchema>;
export type MessageUpdateRequest = z.infer<typeof MessageUpdateRequestSchema>;
export type ConversationTypingRequest = z.infer<
  typeof ConversationTypingRequestSchema
>;
export type PasskeyChallengeRequest = z.infer<
  typeof PasskeyChallengeRequestSchema
>;
export type PasskeyChallenge = z.infer<typeof PasskeyChallengeSchema>;
export type PasskeyVerifyRequest = z.infer<typeof PasskeyVerifyRequestSchema>;
export type PasskeyVerifyResponse = z.infer<
  typeof PasskeyVerifyResponseSchema
>;
export type SessionRefreshRequest = z.infer<typeof SessionRefreshRequestSchema>;
export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;
export type DeviceApprovalRequest = z.infer<
  typeof DeviceApprovalRequestSchema
>;
export type DeviceRevokeRequest = z.infer<typeof DeviceRevokeRequestSchema>;
export type DeviceLabelUpdateRequest = z.infer<
  typeof DeviceLabelUpdateRequestSchema
>;
export type BlockUserRequest = z.infer<typeof BlockUserRequestSchema>;
export type ReportCreateRequest = z.infer<typeof ReportCreateRequestSchema>;
export type AccountDeleteRequest = z.infer<typeof AccountDeleteRequestSchema>;
export type RealtimeEnvelope = z.infer<typeof RealtimeEnvelopeSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const HTTP_CONTRACTS = [
  "/ready",
  "/auth/passkey/challenge",
  "/auth/passkey/verify",
  "/auth/session/refresh",
  "/auth/devices",
  "/devices/approve",
  "/devices/revoke",
  "/auth/onboarding",
  "/identity/handles",
  "/workspaces",
  "/conversations",
  "/channels",
  "/attachments/sign",
  "/attachments/:attachmentId/upload",
  "/attachments/:attachmentId/content",
  "/attachments/finalize",
  "/discovery/contacts",
] as const;

export const REALTIME_CONTRACTS = [...realtimeEventValues];

const now = new Date("2026-04-05T09:15:00.000Z");

function relative(minutesAgo: number) {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString();
}

function future(minutesAhead: number) {
  return new Date(now.getTime() + minutesAhead * 60_000).toISOString();
}

export function createDemoState(): SynqBootstrapState {
  const currentUserId = "user_me";
  const currentDeviceId = "dev_01";

  const users: User[] = [
    {
      id: currentUserId,
      name: "Numa",
      handle: "numa.ghost",
      role: "Founder",
      avatar: "N",
      bio: "Building sovereign communication for creators and private teams.",
      trustState: "verified",

      ghostMode: true,
      profileVisibility: "handle_only",
      hiddenAvatar: false,
      privateDiscovery: false,
      onboardingComplete: true,
      linkedEmail: "numa@synq.local",
    },
    {
      id: "user_arya",
      name: "Arya Sol",
      handle: "arya.sol",
      role: "Design Director",
      avatar: "A",
      bio: "Visual systems, motion grammar, impossible interfaces.",
      trustState: "verified",

      ghostMode: false,
      profileVisibility: "full",
      hiddenAvatar: false,
      privateDiscovery: false,
      onboardingComplete: true,
    },
    {
      id: "user_kai",
      name: "Kai Vale",
      handle: "kai.vale",
      role: "Community Architect",
      avatar: "K",
      bio: "Creator infrastructure, rituals, rooms, moderation.",
      trustState: "watch",

      ghostMode: false,
      profileVisibility: "full",
      hiddenAvatar: false,
      privateDiscovery: false,
      onboardingComplete: true,
      linkedPhone: "+91-00000-00000",
    },
  ];

  const recoveryMethods: RecoveryMethod[] = [
    {
      id: "recovery_mail_me",
      kind: "email",
      value: "numa@synq.local",
      verifiedAt: relative(480),
    },
  ];

  const devices: Device[] = [
    {
      id: currentDeviceId,
      userId: currentUserId,
      label: "Studio Mac",
      publicKey: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
      passkeyEnabled: true,
      trustState: "approved",
      approvedAt: relative(500),
      lastSeenAt: relative(1),
      credentialId: "cred_me_mac",
      fingerprint: "AQEBAQEBAQEBAQEB",
    },
    {
      id: "dev_02",
      userId: "user_arya",
      label: "Vision Pro",
      publicKey: "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=",
      passkeyEnabled: true,
      trustState: "approved",
      approvedAt: relative(1200),
      lastSeenAt: relative(6),
      credentialId: "cred_arya_vp",
      fingerprint: "AgICAgICAgICAgIC",
    },
    {
      id: "dev_03",
      userId: "user_kai",
      label: "Pixel Fold",
      publicKey: "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM=",
      passkeyEnabled: true,
      trustState: "approved",
      approvedAt: relative(2200),
      lastSeenAt: relative(18),
      credentialId: "cred_kai_fold",
      fingerprint: "AwMDAwMDAwMDAwMD",
    },
    {
      id: "dev_pending_me",
      userId: currentUserId,
      label: "Travel iPad",
      publicKey: "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=",
      passkeyEnabled: true,
      trustState: "pending",
      lastSeenAt: relative(3),
      credentialId: "cred_me_ipad",
      fingerprint: "BAQEBAQEBAQEBAQE",
    },
  ];

  const passkeys: PasskeyCredential[] = devices
    .filter((device) => device.credentialId)
    .map((device, index) => ({
      id: device.credentialId!,
      userId: device.userId,
      deviceId: device.id,
      label: device.label,
      publicKey: device.publicKey,
      counter: index + 1,
      createdAt: relative(700 + index * 10),
      lastUsedAt: device.lastSeenAt,
    }));

  const deviceApprovals: DeviceApproval[] = [
    {
      id: "approval_pending_ipad",
      userId: currentUserId,
      deviceId: "dev_pending_me",
      status: "pending",
      requestedAt: relative(3),
    },
  ];

  const workspacePolicies: WorkspacePolicy[] = [
    {
      id: "policy_synq",
      workspaceId: "ws_synq",

      inviteOnly: true,
      retentionDays: 90,
    },
    {
      id: "policy_ghost",
      workspaceId: "ws_ghost",

      inviteOnly: false,
      retentionDays: 365,
    },
  ];

  const workspaces: Workspace[] = [
    {
      id: "ws_synq",
      name: "Synq Foundry",
      slug: "synq-foundry",
      description: "Private operating room for launch, protocol, and product rituals.",
      ambientScene: "Aurora Vault",
      memberCount: 18,

      policyId: "policy_synq",
    },
    {
      id: "ws_ghost",
      name: "Ghost Broadcast",
      slug: "ghost-broadcast",
      description: "Creator-facing broadcast surface with premium discovery mechanics.",
      ambientScene: "Coral Drift",
      memberCount: 143,

      policyId: "policy_ghost",
    },
  ];

  const circles: Circle[] = [
    {
      id: "circle_core",
      name: "Core Crew",
      visibility: "e2ee",
      memberCount: 5,
    },
    {
      id: "circle_press",
      name: "Press Shadow",
      visibility: "managed_private",
      memberCount: 12,
    },
  ];

  const conversations: Conversation[] = [
    {
      id: "conv_dm_arya",
      title: "Arya Sol",
      subtitle: "Design Director",
      kind: "dm",
      visibility: "e2ee",
      participantIds: [currentUserId, "user_arya"],
      unreadCount: 2,
      disappearingSeconds: 86400,
      lastActivityAt: relative(2),
      lastMessagePreview: "Encrypted message",
      messageProtection: "ratcheted",

      ownerUserId: currentUserId,
      typingUserIds: [],
    },
    {
      id: "conv_group_core",
      title: "Core Crew",
      subtitle: "Prototype room",
      kind: "private_group",
      visibility: "e2ee",
      participantIds: [currentUserId, "user_arya", "user_kai"],
      unreadCount: 5,
      disappearingSeconds: 604800,
      lastActivityAt: relative(9),
      lastMessagePreview: "Encrypted message",
      messageProtection: "sender_key",

      ownerUserId: currentUserId,
      joinCode: "CORE01",
      typingUserIds: [],
    },
    {
      id: "conv_workspace_launch",
      title: "Launch Control",
      subtitle: "Synq Foundry",
      kind: "workspace_room",
      visibility: "managed_private",
      participantIds: [currentUserId, "user_arya", "user_kai"],
      unreadCount: 0,
      lastActivityAt: relative(15),
      lastMessagePreview: "Pinned the final rollout deck and policy audit.",
      messageProtection: "managed_plaintext",

      ownerUserId: currentUserId,
      joinCode: "LAUNCH",
      typingUserIds: [],
      workspaceId: "ws_synq",
    },
    {
      id: "conv_creator",
      title: "Ghost Dispatch",
      subtitle: "Broadcast room",
      kind: "creator_channel",
      visibility: "managed_broadcast",
      participantIds: [currentUserId, "user_kai"],
      unreadCount: 9,
      lastActivityAt: relative(20),
      lastMessagePreview: "Tonight we open the vault.",
      messageProtection: "managed_plaintext",

      ownerUserId: currentUserId,
      joinCode: "GHOST1",
      typingUserIds: [],
      workspaceId: "ws_ghost",
    },
  ];

  const channels: Channel[] = [
    {
      id: "channel_ops",
      workspaceId: "ws_synq",
      name: "ops-signal",
      purpose: "Security, audit, and rollout ritual",
      kind: "workspace_room",
      visibility: "managed_private",
      unreadCount: 3,
    },
    {
      id: "channel_stage",
      workspaceId: "ws_ghost",
      name: "stage-lights",
      purpose: "Creator premieres and audience drops",
      kind: "creator_channel",
      visibility: "managed_broadcast",
      unreadCount: 12,
    },
  ];

  const attachmentObjects: AttachmentObject[] = [
    {
      id: "attobj_ghost_note",
      ownerUserId: currentUserId,
      keyId: "attk_01",
      status: "committed",
      uploadUrl: "https://storage.synq.local/upload/attk_01",
      encryptedUrl: "encrypted://ghost-intro",
      createdAt: relative(25),
      committedAt: relative(24),
    },
  ];

  const messages: MessageEnvelope[] = [
    {
      id: "msg_001",
      clientId: "seed_001",
      conversationId: "conv_dm_arya",
      senderId: "user_arya",
      ciphertext: "sealed:1",
      preview: "Encrypted message",
      createdAt: relative(11),
      status: "read",
      messageProtection: "ratcheted",
      mentions: [],
      reactions: [],
      attachments: [],
    },
    {
      id: "msg_002",
      clientId: "seed_002",
      conversationId: "conv_dm_arya",
      senderId: currentUserId,
      ciphertext: "sealed:2",
      preview: "Encrypted message",
      createdAt: relative(8),
      status: "read",
      messageProtection: "ratcheted",
      mentions: [],
      reactions: [],
      attachments: [],
    },
    {
      id: "msg_003",
      clientId: "seed_003",
      conversationId: "conv_dm_arya",
      senderId: "user_arya",
      ciphertext: "sealed:3",
      preview: "Encrypted message",
      createdAt: relative(4),
      status: "sent",
      messageProtection: "ratcheted",
      mentions: [],
      reactions: [],
      attachments: [],
    },
    {
      id: "msg_004",
      clientId: "seed_004",
      conversationId: "conv_group_core",
      senderId: "user_kai",
      ciphertext: "sealed:4",
      preview: "Encrypted message",
      createdAt: relative(9),
      status: "sent",
      messageProtection: "sender_key",
      mentions: [currentUserId],
      reactions: [],
      attachments: [],
    },
    {
      id: "msg_005",
      clientId: "seed_005",
      conversationId: "conv_group_core",
      senderId: currentUserId,
      ciphertext: "sealed:5",
      preview: "Encrypted message",
      createdAt: relative(6),
      status: "sent",
      messageProtection: "sender_key",
      mentions: [],
      reactions: [],
      attachments: [],
    },
    {
      id: "msg_006",
      clientId: "seed_006",
      conversationId: "conv_workspace_launch",
      senderId: currentUserId,
      ciphertext: "managed:6",
      preview: "Pinned the final rollout deck and policy audit.",
      createdAt: relative(15),
      status: "read",
      messageProtection: "managed_plaintext",
      mentions: [],
      reactions: [],
      attachments: [],
    },
    {
      id: "msg_007",
      clientId: "seed_007",
      conversationId: "conv_creator",
      senderId: currentUserId,
      ciphertext: "managed:7",
      preview: "Tonight we open the vault.",
      createdAt: relative(20),
      status: "sent",
      messageProtection: "managed_plaintext",
      mentions: [],
      reactions: [],
      attachments: [
        {
          id: "att_ghost_note",
          name: "ghost-intro.ogg",
          mimeType: "audio/ogg",
          size: 482300,
          keyId: "attk_01",
          nonce: "nonce_01",
          status: "committed",
          encryptedUrl: "encrypted://ghost-intro",
        },
      ],
    },
  ];

  const presence: Presence[] = [
    {
      userId: currentUserId,
      state: "online",
      scene: "Trust Orb",
      updatedAt: relative(0),
    },
    {
      userId: "user_arya",
      state: "focus",
      scene: "Motion Forge",
      updatedAt: relative(4),
    },
    {
      userId: "user_kai",
      state: "online",
      scene: "Broadcast Deck",
      updatedAt: relative(2),
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      id: "audit_device_bootstrap",
      type: "device.approved",
      userId: currentUserId,
      deviceId: currentDeviceId,
      createdAt: relative(500),
      details: {
        label: "Studio Mac",
      },
    },
    {
      id: "audit_pending_request",
      type: "device.requested",
      userId: currentUserId,
      deviceId: "dev_pending_me",
      createdAt: relative(3),
      details: {
        label: "Travel iPad",
      },
    },
  ];

  const disappearingJobs: DisappearingMessageJob[] = [
    {
      id: "job_msg_005",
      messageId: "msg_005",
      conversationId: "conv_group_core",
      deleteAt: future(60 * 24 * 7),
      status: "scheduled",
    },
  ];

  const activeSession: Session = {
    id: "session_me_web",
    userId: currentUserId,
    deviceId: currentDeviceId,
    scope: "web",
    accessToken: "synq_demo_access",
    refreshToken: "synq_demo_refresh",
    issuedAt: relative(15),
    expiresAt: future(45),
    refreshExpiresAt: future(60 * 24 * 14),
    pendingApproval: false,
  };

  return {
    currentUserId,
    currentDeviceId,
    activeSession,
    users,
    recoveryMethods,
    devices,
    passkeys,
    deviceApprovals,
    workspacePolicies,
    workspaces,
    circles,
    conversations,
    channels,
    attachmentObjects,
    messages,
    pinnedMessages: [],
    conversationMemberships: [],
    typingIndicators: [],
    blockRecords: [],
    reports: [],
    moderationLogs: [],
    presence,
    auditEvents,
    disappearingJobs,
  };
}
