"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { bytesToBase64String, encryptAttachmentBytes } from "@synq/crypto";
import type {
  Attachment,
  Conversation,
  MessageEnvelope,
  ProfileVisibility,
  RealtimeEnvelope,
  SynqBootstrapState,
  User,
} from "@synq/protocol";
import { cx, GlassCard, SectionLabel, StatusPill, motionTokens } from "@synq/ui";

import {
  blockUser,
  completeOnboarding,
  connectRealtime,
  createConversation,
  deleteAccount,
  deleteMessage,
  editMessage,
  fetchAuthDebug,
  fetchBootstrap,
  finalizeAttachment,
  findContacts,
  joinConversation,
  markConversationRead,
  pinMessage,
  reactToMessage,
  renameDevice,
  reportMessage,
  revokeDevice,
  
  sendMessage,
  signAttachment,
  startDirectConversation,
  updateProfile,
  updateTyping,
  uploadAttachmentContent,
} from "@/lib/api";
import {
  getConversationVault,
  putVaultMessage,
  rekeyVaultMessage,
} from "@/lib/message-vault";

import {
  enqueueMessage,
  flushQueuedMessages,
  getQueuedMessages,
} from "@/lib/offline-queue";
import { sealPreviewForRecipient } from "@/lib/session-crypto";

import { TrustOrb } from "./trust-orb";

type AuthStage = "loading" | "signed_out" | "ready";
type ToastTone = "success" | "error" | "info";
type DockTab = "memory" | "safety" | "ai";
type OnboardingStep = "identity" | "privacy" | "enter";

type ToastState = { id: string; tone: ToastTone; message: string };

type ProfileDraft = {
  name: string;
  bio: string;
  avatar: string;
  ghostMode: boolean;
  profileVisibility: ProfileVisibility;
  hiddenAvatar: boolean;
  privateDiscovery: boolean;
};

type SpaceNavItem = {
  id: string;
  kind: "direct" | "workspace";
  name: string;
  caption: string;
  glyph: string;
  unreadCount: number;
};

const QUICK_REACTIONS = [
  "\u{1F44D}",
  "\u{1F525}",
  "\u{1FAF6}",
  "\u{1F440}",
];
const DOCK_TABS: Array<{ id: DockTab; label: string; caption: string }> = [
  { id: "memory", label: "Memory", caption: "Context and pinned signals" },
  { id: "safety", label: "Safety", caption: "Devices, reports, and account controls" },
  
];
const ONBOARDING_STEPS: Array<{ id: OnboardingStep; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "privacy", label: "Privacy" },
  { id: "enter", label: "Enter Synq" },
];

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toneLabel(conversation: Conversation) {
  if (conversation.visibility === "e2ee") return "sealed";
  if (conversation.kind === "creator_channel") return "broadcast";
  return "managed";
}

function describeAuthError(code: string | null) {
  if (!code) return "";
  if (code === "AccessDenied") return "This Google account cannot open Synq right now.";
  if (code === "EnvConflict")
    return "Synq found conflicting auth env vars. Keep only one Google OAuth pair, and make AUTH_SECRET and NEXTAUTH_SECRET identical.";
  if (code === "MissingCSRF")
    return "Synq could not start Google sign-in securely. Refresh once and try again.";
  if (code === "Configuration")
    return "Google auth is not configured yet. Add AUTH_SECRET, AUTH_GOOGLE_ID, and AUTH_GOOGLE_SECRET in Vercel, or use NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET.";
  return "Synq could not complete sign-in with Google.";
}

function initialProfileDraft(user?: User | null): ProfileDraft {
  return {
    name: user?.name ?? "",
    bio: user?.bio ?? "",
    avatar: user?.avatar ?? "S",
    ghostMode: user?.ghostMode ?? true,
    profileVisibility: user?.profileVisibility ?? "handle_only",
    hiddenAvatar: user?.hiddenAvatar ?? false,
    privateDiscovery: user?.privateDiscovery ?? false,
  };
}

function displayIdentity(user?: User | null) {
  if (!user) return "Unknown";
  return user.profileVisibility === "handle_only" || user.ghostMode
    ? `@${user.handle}`
    : user.name;
}

function displayAvatar(user?: User | null) {
  if (!user) return "?";
  return user.hiddenAvatar ? "--" : user.avatar;
}

function roomGlyph(conversation?: Conversation | null) {
  if (!conversation) return "??";
  if (conversation.kind === "creator_channel") return "BC";
  if (conversation.kind === "dm") return "DM";
  if (conversation.visibility === "e2ee") return "E2";
  return conversation.title
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "S");
}

function workspaceGlyph(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKind(attachment: Attachment) {
  if (attachment.mimeType.startsWith("audio/")) return "voice";
  if (attachment.mimeType.startsWith("image/")) return "image";
  return "file";
}

function conversationTone(conversation?: Conversation | null): "sealed" | "managed" | "broadcast" {
  if (!conversation) return "sealed";
  if (conversation.kind === "creator_channel") return "broadcast";
  return conversation.visibility === "e2ee" ? "sealed" : "managed";
}

function conversationAmbientClass(conversation?: Conversation | null) {
  const tone = conversationTone(conversation);
  if (tone === "broadcast") return "synq-ambient synq-ambient--broadcast";
  if (tone === "managed") return "synq-ambient synq-ambient--managed";
  return "synq-ambient synq-ambient--sealed";
}

function DockToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5" />
      <path d="M10.5 4.5v7" />
      {collapsed ? <path d="M8 8h2.5" /> : <path d="M5.5 8h2.5" />}
    </svg>
  );
}

function ProfilePanelIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 10.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M4.75 16.25c.82-2.2 2.74-3.5 5.25-3.5s4.43 1.3 5.25 3.5" />
      <path d="M15.5 6.5h1.75" />
      <path d="M16.375 5.625v1.75" />
    </svg>
  );
}

function SinglePersonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 10.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M4.75 16.25c.82-2.2 2.74-3.5 5.25-3.5s4.43 1.3 5.25 3.5" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 9.75a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M13.25 8.75a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M3.75 15.75c.58-1.77 2.06-2.75 3.98-2.75 1.75 0 3.16.8 3.84 2.25" />
      <path d="M11.5 15.25c.42-1.3 1.43-2 2.83-2 1.15 0 2.06.5 2.67 1.5" />
    </svg>
  );
}

function BroadcastIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 10.25 13.75 6v8.5L4.5 10.25Z" />
      <path d="M4.5 10.25h1.75v3a1.5 1.5 0 0 0 1.5 1.5h.25" />
      <path d="M15.75 8.25a3.25 3.25 0 0 1 0 4" />
      <path d="M17.5 6.25a6 6 0 0 1 0 8" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.25" y="3.75" width="11.5" height="12.5" rx="2.5" />
      <path d="M7 7h6" />
      <path d="M7 10h6" />
      <path d="M7 13h3.5" />
    </svg>
  );
}

function SafetyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3.5 15.75 5.75v3.9c0 3.16-1.84 5.51-5.75 6.85-3.91-1.34-5.75-3.69-5.75-6.85v-3.9L10 3.5Z" />
      <path d="m8 10 1.4 1.4L12.75 8" />
    </svg>
  );
}



function renderDockTabIcon(tab: DockTab) {
  if (tab === "memory") return <MemoryIcon />;
  if (tab === "safety") return <SafetyIcon />;
  return null;
}

function MiniDockOrb({
  tone = "sealed",
  active = false,
}: {
  tone?: "sealed" | "managed" | "broadcast";
  active?: boolean;
}) {
  const coreColor =
    tone === "broadcast" ? "#FF8B78" : tone === "managed" ? "#98FFD5" : "#5DE4FF";
  const haloColor = tone === "broadcast" ? "#5DE4FF" : "#A58BFF";

  return (
    <div
      className={cx(
        "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] border transition",
        active
          ? "border-[#5DE4FF]/32 bg-white/[0.05] shadow-[0_14px_28px_rgba(7,16,26,0.24)]"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      <div
        className="absolute inset-2 rounded-full blur-[1px]"
        style={{
          background: `radial-gradient(circle, ${coreColor}dd, ${coreColor}25 58%, transparent 72%)`,
        }}
      />
      <div
        className="absolute inset-1 rounded-full blur-lg"
        style={{
          background: `radial-gradient(circle, ${haloColor}38, transparent 70%)`,
        }}
      />
      <div className="relative h-6 w-6 rounded-full border border-white/10 bg-white/10" />
    </div>
  );
}

function renderSpaceIcon(space: SpaceNavItem) {
  if (space.kind === "direct") return <SinglePersonIcon />;
  if (/broadcast/i.test(space.name)) return <BroadcastIcon />;
  return <GroupIcon />;
}

export function ChatExperience() {
  const { status, data: session } = useSession();
  const searchParams = useSearchParams();
  const authErrorCode = searchParams.get("error");
  const reduceMotion = useReducedMotion();

  const [authStage, setAuthStage] = useState<AuthStage>("loading");
  const [state, setState] = useState<SynqBootstrapState | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("direct");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [draft, setDraft] = useState("");
  const [vault, setVault] = useState<Record<string, string>>({});
  const [queueCount, setQueueCount] = useState(0);
  const [connectionLabel, setConnectionLabel] = useState("google-oauth");
  const [attachmentState, setAttachmentState] = useState("No attachments staged.");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingHandle, setOnboardingHandle] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [ghostMode, setGhostMode] = useState(true);
  const [onboardingHiddenAvatar, setOnboardingHiddenAvatar] = useState(false);
  const [onboardingPrivateDiscovery, setOnboardingPrivateDiscovery] = useState(false);
  const [onboardingVisibility, setOnboardingVisibility] =
    useState<ProfileVisibility>("handle_only");
  const [authError, setAuthError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUtilitiesOpen, setIsUtilitiesOpen] = useState(false);
  const [isRoomActionsCollapsed, setIsRoomActionsCollapsed] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [handleSearch, setHandleSearch] = useState("");
  const [contactResults, setContactResults] = useState<User[]>([]);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(initialProfileDraft());
  const [replyToMessageId, setReplyToMessageId] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomSubtitle, setRoomSubtitle] = useState("");
  const [roomHandles, setRoomHandles] = useState("");
  const [deviceLabels, setDeviceLabels] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [cloudResult, setCloudResult] = useState("");
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [activeDockTab, setActiveDockTab] = useState<DockTab>("memory");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("identity");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isMobileIdentityOpen, setIsMobileIdentityOpen] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(true);
  const [isProfileFlyoutOpen, setIsProfileFlyoutOpen] = useState(false);
  const deferredDraft = useDeferredValue(draft);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const utilitiesRef = useRef<HTMLDivElement | null>(null);
  const profileFlyoutRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const currentUser = useMemo(
    () => state?.users.find((user) => user.id === state.currentUserId) ?? null,
    [state],
  );
  const currentDevice = useMemo(
    () => state?.devices.find((device) => device.id === state.currentDeviceId) ?? null,
    [state],
  );
  const canModerate = currentUser?.role === "Owner" || currentUser?.role === "Moderator";
  const visibleConversations = useMemo(() => {
    if (!state) return [];
    return state.conversations
      .filter((conversation) =>
        selectedWorkspaceId === "direct"
          ? !conversation.workspaceId
          : conversation.workspaceId === selectedWorkspaceId,
      )
      .sort(
        (left, right) =>
          new Date(right.lastActivityAt).getTime() -
          new Date(left.lastActivityAt).getTime(),
      );
  }, [selectedWorkspaceId, state]);
  const selectedConversation = useMemo(
    () =>
      visibleConversations.find((conversation) => conversation.id === selectedConversationId) ??
      visibleConversations[0],
    [selectedConversationId, visibleConversations],
  );
  const conversationMessages = useMemo(
    () =>
      state?.messages.filter((message) => message.conversationId === selectedConversation?.id) ??
      [],
    [selectedConversation?.id, state?.messages],
  );
  const resolvedMessages = useMemo(
    () =>
      conversationMessages.map((message) => {
        const ref = message.clientId ?? message.id;
        return {
          ...message,
          preview:
            selectedConversation?.visibility === "e2ee"
              ? vault[message.id] ??
                vault[ref] ??
                (message.deletedAt ? "Message deleted." : "Encrypted on this device.")
              : message.preview,
        };
      }),
    [conversationMessages, selectedConversation?.visibility, vault],
  );
  const filteredMessages = useMemo(() => {
    const needle = messageSearch.trim().toLowerCase();
    if (!needle) return resolvedMessages;
    return resolvedMessages.filter((message) =>
      message.preview.toLowerCase().includes(needle),
    );
  }, [messageSearch, resolvedMessages]);
  const decoratedMessages = useMemo(
    () =>
      filteredMessages.map((message, index, array) => {
        const previous = array[index - 1];
        const next = array[index + 1];
        const previousGap = previous
          ? Math.abs(new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime())
          : Number.POSITIVE_INFINITY;
        const nextGap = next
          ? Math.abs(new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime())
          : Number.POSITIVE_INFINITY;

        return {
          message,
          groupedWithPrevious:
            Boolean(previous) &&
            previous.senderId === message.senderId &&
            previousGap < 5 * 60 * 1000,
          groupedWithNext:
            Boolean(next) && next.senderId === message.senderId && nextGap < 5 * 60 * 1000,
        };
      }),
    [filteredMessages],
  );
  const replyTarget = useMemo(
    () =>
      resolvedMessages.find(
        (message) => message.id === replyToMessageId || message.clientId === replyToMessageId,
      ),
    [replyToMessageId, resolvedMessages],
  );
  const pinnedMessages = useMemo(() => {
    if (!state || !selectedConversation) return [];
    return state.pinnedMessages
      .filter((pin) => pin.conversationId === selectedConversation.id)
      .map((pin) => resolvedMessages.find((message) => message.id === pin.messageId))
      .filter(Boolean) as MessageEnvelope[];
  }, [resolvedMessages, selectedConversation, state]);
  
  
  
  const typingUsers = useMemo(
    () =>
      (selectedConversation?.typingUserIds ?? [])
        .filter((userId) => userId !== currentUser?.id)
        .map((userId) => state?.users.find((user) => user.id === userId))
        .filter(Boolean) as User[],
    [currentUser?.id, selectedConversation?.typingUserIds, state?.users],
  );
  const totalUnreadCount = useMemo(
    () =>
      state?.conversations.reduce((count, conversation) => count + conversation.unreadCount, 0) ??
      0,
    [state?.conversations],
  );
  const unreadBySpace = useMemo(() => {
    const byWorkspace = new Map<string, number>();
    let direct = 0;

    for (const conversation of state?.conversations ?? []) {
      const unreadCount = conversation.unreadCount ?? 0;
      if (!conversation.workspaceId) {
        direct += unreadCount;
        continue;
      }

      byWorkspace.set(
        conversation.workspaceId,
        (byWorkspace.get(conversation.workspaceId) ?? 0) + unreadCount,
      );
    }

    return { direct, byWorkspace };
  }, [state?.conversations]);
  const spaceItems = useMemo<SpaceNavItem[]>(
    () => [
      {
        id: "direct",
        kind: "direct",
        name: "Direct signals",
        caption: "Private threads you choose to open.",
        glyph: "DM",
        unreadCount: unreadBySpace.direct,
      },
      ...((state?.workspaces ?? []).map((workspace) => ({
        id: workspace.id,
        kind: "workspace" as const,
        name: workspace.name,
        caption: workspace.ambientScene || workspace.description,
        glyph: workspaceGlyph(workspace.name),
        unreadCount: unreadBySpace.byWorkspace.get(workspace.id) ?? 0,
      })) satisfies SpaceNavItem[]),
    ],
    [state?.workspaces, unreadBySpace],
  );
  const selectedSpace = useMemo<SpaceNavItem>(
    () =>
      spaceItems.find((space) => space.id === selectedWorkspaceId) ?? {
        id: "direct",
        kind: "direct",
        name: "Direct signals",
        caption: "Private threads you choose to open.",
        glyph: "DM",
        unreadCount: unreadBySpace.direct,
      },
    [selectedWorkspaceId, spaceItems, unreadBySpace.direct],
  );
  const ghostPreviewIdentity =
    profileDraft.profileVisibility === "handle_only" || profileDraft.ghostMode
      ? `@${currentUser?.handle ?? "ghost"}`
      : profileDraft.name || currentUser?.name || "Synq User";
  const ghostPreviewAvatar = profileDraft.hiddenAvatar
    ? "--"
    : profileDraft.avatar || currentUser?.avatar || "S";
  const profileFlyoutBody = (
    <div className="synq-scroll synq-scroll--subtle max-h-[min(72vh,760px)] overflow-y-auto pr-1">
      <div className="space-y-3">
        <div className="rounded-[26px] border border-white/8 bg-white/[0.035] p-4">
          <div className="flex items-start gap-4">
            <div className="synq-sigil flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 text-lg font-semibold text-white">
              {ghostPreviewAvatar}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-semibold text-white">{ghostPreviewIdentity}</p>
                {profileDraft.ghostMode ? (
                  <StatusPill tone="mint" className="text-[10px] tracking-[0.16em]">
                    GHOST
                  </StatusPill>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/58">
                {profileDraft.privateDiscovery
                  ? "Private discovery is on. Exact handles work best."
                  : profileDraft.bio || "Tune your presence before you invite friends in."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-white/8 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Find people</SectionLabel>
            <StatusPill tone="cyan">By handle</StatusPill>
          </div>
          <input
            value={handleSearch}
            onChange={(event) => setHandleSearch(event.target.value)}
            placeholder="Search handles"
            className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none"
          />
          <div className="mt-3 grid gap-2">
            {contactResults.length ? (
              contactResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => void handleStartDirect(user.handle)}
                  className="rounded-[20px] border border-white/8 bg-white/[0.04] px-3 py-3 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white">
                        {displayAvatar(user)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{displayIdentity(user)}</p>
                        <p className="text-xs text-white/50">
                          {user.privateDiscovery ? "Exact-handle discovery" : user.bio}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/55">
                      DM
                    </span>
                  </div>
                </button>
              ))
            ) : handleSearch.trim() ? (
              <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-white/55">
                No matching handle yet.
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-white/55">
                Search by handle to start private signals with friends.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[26px] border border-white/8 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Ghost profile</SectionLabel>
            <StatusPill tone="mint">{profileDraft.ghostMode ? "Stealth" : "Open"}</StatusPill>
          </div>
          <div className="mt-4 grid gap-3">
            <input
              value={profileDraft.name}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Display name"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none"
            />
            <input
              value={profileDraft.avatar}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  avatar: event.target.value.slice(0, 2) || current.avatar,
                }))
              }
              placeholder="Avatar letters"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none"
            />
            <textarea
              value={profileDraft.bio}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, bio: event.target.value }))
              }
              rows={3}
              placeholder="Short bio"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none"
            />
          </div>
          <div className="mt-4 grid gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] p-3 text-sm text-white/70">
            <label className="flex items-center justify-between gap-3">
              <span>Ghost mode</span>
              <input
                type="checkbox"
                checked={profileDraft.ghostMode}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    ghostMode: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Hidden avatar</span>
              <input
                type="checkbox"
                checked={profileDraft.hiddenAvatar}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    hiddenAvatar: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Private discovery</span>
              <input
                type="checkbox"
                checked={profileDraft.privateDiscovery}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    privateDiscovery: event.target.checked,
                  }))
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(["handle_only", "full"] as ProfileVisibility[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    setProfileDraft((current) => ({
                      ...current,
                      profileVisibility: mode,
                    }))
                  }
                  className={`rounded-full border px-3 py-2 text-xs ${
                    profileDraft.profileVisibility === mode
                      ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10 text-white"
                      : "border-white/10 text-white/55"
                  }`}
                >
                  {mode === "handle_only" ? "Handle only" : "Full profile"}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveProfile()}
            className="mt-4 rounded-full border border-[#5DE4FF]/30 bg-[#5DE4FF]/10 px-4 py-2 text-sm text-white"
          >
            Save profile
          </button>
        </div>
      </div>
    </div>
  );

  function pushToast(tone: ToastTone, message: string) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  }

  function scrollConversationToLatest(behavior: ScrollBehavior = "smooth") {
    const container = messageListRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }

  function closeSearchPanel() {
    setIsSearchOpen(false);
    setMessageSearch("");
  }

  function openSearchPanel(nextValue?: string) {
    if (typeof nextValue === "string") {
      setMessageSearch(nextValue);
    }
    setIsSearchOpen(true);
  }

  function handleSelectWorkspace(nextWorkspaceId: string, closeMobileSheet = false) {
    setSelectedWorkspaceId(nextWorkspaceId);
    if (closeMobileSheet) {
      setIsMobileIdentityOpen(false);
    }
  }

  function handleOpenProfileDock(closeMobileSheet = false) {
    setIsProfileFlyoutOpen((current) => (closeMobileSheet ? true : !current));
    if (closeMobileSheet) {
      setIsMobileIdentityOpen(false);
    }
  }

  async function loadBootstrap(quiet = false) {
    try {
      const payload = await fetchBootstrap();
      if (!payload) {
        setState(null);
        setAuthStage("signed_out");
        return false;
      }

      startTransition(() => {
        setState(payload);
        setSelectedWorkspaceId((current) =>
          current !== "direct" && payload.workspaces.some((workspace) => workspace.id === current)
            ? current
            : payload.conversations.some((conversation) => !conversation.workspaceId)
              ? "direct"
              : payload.workspaces[0]?.id ?? "direct",
        );
        setSelectedConversationId((current) =>
          payload.conversations.some((conversation) => conversation.id === current)
            ? current
            : payload.conversations[0]?.id ?? "",
        );
        const viewer = payload.users.find((user) => user.id === payload.currentUserId) ?? null;
        setOnboardingName(viewer?.name ?? session?.user?.name ?? "");
        setOnboardingHandle(viewer?.handle ?? "");
        setGhostMode(viewer?.ghostMode ?? true);
        setOnboardingHiddenAvatar(viewer?.hiddenAvatar ?? false);
        setOnboardingPrivateDiscovery(viewer?.privateDiscovery ?? false);
        setOnboardingVisibility(viewer?.profileVisibility ?? "handle_only");
        setProfileDraft(initialProfileDraft(viewer));
        setDeviceLabels(
          Object.fromEntries(
            payload.devices
              .filter((device) => device.userId === payload.currentUserId)
              .map((device) => [device.id, device.label]),
          ),
        );
      });
      setConnectionLabel("polling-sync");
      setAuthStage("ready");
      if (!quiet) {
        setComposerError("");
      }
      return true;
    } catch {
      setAuthStage("signed_out");
      setAuthError("Synq could not load your workspace.");
      return false;
    }
  }

  function applyAck(message: MessageEnvelope) {
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.some((item) => item.clientId === message.clientId)
          ? current.messages.map((item) =>
              item.clientId === message.clientId ? { ...item, id: message.id, status: message.status } : item,
            )
          : [...current.messages, message],
      };
    });

    if (selectedConversation?.visibility === "e2ee" && message.clientId) {
      void rekeyVaultMessage(message.conversationId, message.clientId, message.id).then(() =>
        getConversationVault(message.conversationId).then((nextVault) => setVault(nextVault)),
      );
    }
  }

  function handleRealtime(event: RealtimeEnvelope) {
    if (event.type === "session.ready") {
      setConnectionLabel(event.payload.pendingApproval ? "pending-trust" : "live");
    }
  }

  useEffect(() => {
    void getQueuedMessages().then((queue) => setQueueCount(queue.length));
  }, []);

  useEffect(() => {
    if (status === "loading") {
      setAuthStage("loading");
      return;
    }

    if (status === "unauthenticated") {
      setState(null);
      setAuthStage("signed_out");
      setAuthError(describeAuthError(authErrorCode));
      return;
    }

    void loadBootstrap();
  }, [authErrorCode, status, session?.user?.email]);

  useEffect(() => {
    setIsUtilitiesOpen(false);
    closeSearchPanel();
  }, [selectedConversation?.id]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const updateJumpState = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowJumpToLatest(distanceFromBottom > 140);
    };

    updateJumpState();
    container.addEventListener("scroll", updateJumpState);
    return () => container.removeEventListener("scroll", updateJumpState);
  }, [selectedConversation?.id, filteredMessages.length]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 140) {
      const frame = window.requestAnimationFrame(() => scrollConversationToLatest("auto"));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [filteredMessages.length, selectedConversation?.id]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isUtilitiesOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!utilitiesRef.current?.contains(event.target as Node)) {
        setIsUtilitiesOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isUtilitiesOpen]);

  useEffect(() => {
    if (!isProfileFlyoutOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!profileFlyoutRef.current?.contains(event.target as Node)) {
        setIsProfileFlyoutOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isProfileFlyoutOpen]);

  useEffect(() => {
    if (status !== "unauthenticated" || !authErrorCode) {
      return;
    }

    if (authErrorCode !== "Configuration" && authErrorCode !== "EnvConflict") {
      return;
    }

    void fetchAuthDebug().then((debug) => {
      if (!debug?.hints?.length) {
        return;
      }

      const message = debug.hints.join(" ");
      setAuthError(message);
    });
  }, [authErrorCode, status]);

  useEffect(() => {
    if (!selectedConversation) return;
    void getConversationVault(selectedConversation.id).then((nextVault) => setVault(nextVault));
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!state || authStage !== "ready") return;
    const socket = connectRealtime(handleRealtime, () => setConnectionLabel("polling-sync"));
    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        void loadBootstrap(true);
      }
    }, 5000);
    const onOnline = () => {
      void flushQueuedMessages(async (message) => {
        const ack = await sendMessage(message);
        applyAck(ack);
      }).then((result) => {
        setQueueCount(result.remaining);
        return loadBootstrap(true);
      });
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      socket.close();
    };
  }, [authStage, state?.currentUserId]);

  useEffect(() => {
    if (authStage !== "ready" || !selectedConversation?.id) return;
    void markConversationRead(selectedConversation.id).catch(() => undefined);
  }, [authStage, selectedConversation?.id]);

  useEffect(() => {
    if (authStage !== "ready" || !selectedConversation?.id) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    void updateTyping(selectedConversation.id, { isTyping: draft.trim().length > 0 }).catch(
      () => undefined,
    );
    typingTimeoutRef.current = setTimeout(() => {
      void updateTyping(selectedConversation.id, { isTyping: false }).catch(() => undefined);
    }, 1500);
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [authStage, draft, selectedConversation?.id]);

  useEffect(() => {
    if (!handleSearch.trim()) {
      setContactResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      void findContacts(handleSearch.trim())
        .then((results) => setContactResults((results as User[]) ?? []))
        .catch(() => setContactResults([]));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [handleSearch]);

  async function handleOnboardingSubmit() {
    if (!onboardingName.trim() || !onboardingHandle.trim()) {
      setAuthError("Name and handle are required before you can continue.");
      return;
    }

    try {
      await completeOnboarding({
        name: onboardingName.trim(),
        handle: onboardingHandle.trim(),
        ghostMode,
        profileVisibility: onboardingVisibility,
        hiddenAvatar: onboardingHiddenAvatar,
        privateDiscovery: onboardingPrivateDiscovery,
        recoveryMethods: [
          ...(recoveryEmail.trim() ? [{ kind: "email" as const, value: recoveryEmail.trim() }] : []),
          ...(recoveryPhone.trim() ? [{ kind: "phone" as const, value: recoveryPhone.trim() }] : []),
        ],
      });
      await loadBootstrap();
      pushToast("success", "Identity completed.");
    } catch {
      setAuthError("Synq could not save your onboarding details.");
    }
  }

  async function handleGoogleSignIn() {
    setAuthError("");
    await signIn("google", {
      redirectTo: "/chat",
    });
  }

  async function handleStageAttachment(file: File) {
    try {
      setAttachmentState(`Encrypting ${file.name}...`);
      setComposerError("");
      const signed = await signAttachment({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size || 1,
      });
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const encryptedBody = encryptAttachmentBytes(fileBytes, signed.secret, signed.nonce);
      await uploadAttachmentContent(signed.attachmentId, {
        encryptedBodyBase64: bytesToBase64String(encryptedBody),
      });
      await finalizeAttachment({
        attachmentId: signed.attachmentId,
        keyId: signed.keyId,
        encryptedUrl: signed.encryptedUrl,
      });
      setPendingAttachments((current) => [
        ...current,
        {
          id: signed.attachmentId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size || 1,
          keyId: signed.keyId,
          nonce: signed.nonce,
          status: "committed",
          encryptedUrl: signed.encryptedUrl,
        },
      ]);
      setAttachmentState(`${file.name} staged.`);
      pushToast("success", `${file.name} is ready to send.`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Synq could not encrypt and stage that file.";
      setAttachmentState("Attachment staging failed.");
      setComposerError(message);
      pushToast("error", message);
    }
  }

  async function handleVoiceNote() {
    if (recordingVoice) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      pushToast("error", "Voice notes are not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: recorder.mimeType || "audio/webm",
        });
        void handleStageAttachment(file);
        setRecordingVoice(false);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingVoice(true);
      pushToast("info", "Recording voice note...");
    } catch {
      pushToast("error", "Microphone access was denied.");
    }
  }

  async function handleSend() {
    if (!selectedConversation || !currentUser || !state) return;
    const trimmedDraft = draft.trim();
    if (!trimmedDraft && !pendingAttachments.length && !editingMessageId) {
      setComposerError("Write a message or stage an attachment first.");
      return;
    }

    const recipientId =
      selectedConversation.participantIds.find((id) => id !== currentUser.id) ?? currentUser.id;
    const recipientKey =
      state.devices.find((device) => device.userId === recipientId)?.publicKey ??
      state.devices.find((device) => device.userId === currentUser.id)?.publicKey;
    if (!recipientKey) {
      pushToast("error", "Synq could not find a trusted recipient device.");
      return;
    }

    setComposerError("");

    try {
      if (editingMessageId) {
        const sealed = sealPreviewForRecipient(trimmedDraft, recipientKey);
        await editMessage(editingMessageId, {
          preview: trimmedDraft,
          ciphertext: sealed.ciphertext,
        });
        if (selectedConversation.visibility === "e2ee") {
          await putVaultMessage(selectedConversation.id, editingMessageId, trimmedDraft);
          setVault(await getConversationVault(selectedConversation.id));
        }
        setEditingMessageId("");
        setDraft("");
        await loadBootstrap(true);
        pushToast("success", "Message edited.");
        return;
      }

      const clientId = crypto.randomUUID();
      const optimisticPreview =
        trimmedDraft ||
        `Sent ${pendingAttachments.length} secure attachment${pendingAttachments.length > 1 ? "s" : ""}.`;
      const sealed = sealPreviewForRecipient(optimisticPreview, recipientKey);
      const optimistic: MessageEnvelope = {
        id: `local_${clientId}`,
        clientId,
        conversationId: selectedConversation.id,
        senderId: currentUser.id,
        ciphertext: sealed.ciphertext,
        preview: optimisticPreview,
        createdAt: new Date().toISOString(),
        status: navigator.onLine ? "sent" : "queued",
        messageProtection: selectedConversation.messageProtection,
        mentions: [],
        replyToId: replyTarget?.id,
        reactions: [],
        attachments: pendingAttachments,
      };
      setState((current) =>
        current
          ? { ...current, messages: [...current.messages, optimistic] }
          : current,
      );
      if (selectedConversation.visibility === "e2ee") {
        await putVaultMessage(selectedConversation.id, clientId, optimisticPreview);
        setVault(await getConversationVault(selectedConversation.id));
      }

      const payload = {
        clientId,
        conversationId: selectedConversation.id,
        ciphertext: sealed.ciphertext,
        preview: selectedConversation.visibility === "e2ee" ? "" : optimisticPreview,
        mentions: [],
        replyToId: replyTarget?.id,
        messageProtection: selectedConversation.messageProtection,
        attachments: pendingAttachments,
      };

      setDraft("");
      setReplyToMessageId("");
      setPendingAttachments([]);
      setAttachmentState("No attachments staged.");

      if (!navigator.onLine) {
        await enqueueMessage(payload);
        setQueueCount((count) => count + 1);
        pushToast("info", "Signal queued and will replay when you reconnect.");
      } else {
        const ack = await sendMessage(payload);
        applyAck(ack);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Synq could not deliver that signal.";
      setComposerError(message);
      pushToast("error", message);
    }
  }

  async function handleCreateRoom() {
    try {
      const created = (await createConversation({
        title: roomTitle.trim(),
        subtitle: roomSubtitle.trim() || "Shared room",
        kind: "private_group",
        visibility: "managed_private",
        participantIds: [],
        participantHandles: roomHandles
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      })) as Conversation;
      setRoomTitle("");
      setRoomSubtitle("");
      setRoomHandles("");
      await loadBootstrap(true);
      setSelectedConversationId(created.id);
      pushToast("success", `${created.title} is live.`);
    } catch {
      pushToast("error", "Synq could not create that room.");
    }
  }

  async function handleJoinRoom() {
    try {
      const joined = (await joinConversation({ code: joinCode.trim() })) as Conversation;
      setJoinCode("");
      await loadBootstrap(true);
      setSelectedConversationId(joined.id);
      pushToast("success", `Joined ${joined.title}.`);
    } catch {
      pushToast("error", "That join code could not be used.");
    }
  }

  async function handleStartDirect(handle: string) {
    try {
      const conversation = (await startDirectConversation({ handle })) as Conversation;
      await loadBootstrap(true);
      setSelectedWorkspaceId("direct");
      setSelectedConversationId(conversation.id);
      setHandleSearch("");
      setContactResults([]);
      setIsProfileFlyoutOpen(false);
      pushToast("success", `Direct signal opened with @${handle}.`);
    } catch {
      pushToast("error", "Synq could not open that direct signal.");
    }
  }

  async function handleSaveProfile() {
    try {
      await updateProfile(profileDraft);
      await loadBootstrap(true);
      pushToast("success", "Profile saved.");
    } catch {
      pushToast("error", "Synq could not save your profile.");
    }
  }

  async function handleWorkspaceAI() {
    if (!selectedConversation || !currentUser) return;
    try {
      if (selectedConversation.visibility === "e2ee") {
        setCloudResult(`Local-only insight: ${localSummary}`);
        pushToast("info", "Sealed-room AI stayed on this device.");
        return;
      }

      const result = await runAIAction({
        conversationId: selectedConversation.id,
        action: "memory",
        policy: currentUser.aiPolicy,
        input: draft || selectedConversation.lastMessagePreview,
      });
      setCloudResult(result.result);
      pushToast("success", "Workspace AI pulse refreshed.");
    } catch {
      pushToast("error", "Workspace AI is unavailable right now.");
    }
  }

  async function handleRefreshAiDock() {
    setIsUtilitiesOpen(false);
    await handleWorkspaceAI();
  }

  function handleOpenSearchFromUtilities() {
    setIsUtilitiesOpen(false);
    openSearchPanel();
  }

  async function handleReaction(messageId: string, emoji: string) {
    await reactToMessage(messageId, { emoji });
    await loadBootstrap(true);
  }

  async function handlePin(messageId: string, pinned: boolean) {
    await pinMessage(messageId, { pinned });
    await loadBootstrap(true);
  }

  async function handleDeleteMessage(messageId: string) {
    await deleteMessage(messageId);
    await loadBootstrap(true);
    pushToast("success", "Message deleted.");
  }

  async function handleReport(messageId: string) {
    const reason = window.prompt("Why are you reporting this message?", "Unsafe or abusive");
    if (!reason?.trim()) return;
    await reportMessage(messageId, { reason: reason.trim() });
    await loadBootstrap(true);
    pushToast("success", "Report submitted.");
  }

  async function handleBlock(userId: string) {
    await blockUser(userId);
    await loadBootstrap(true);
    pushToast("success", "User blocked.");
  }

  async function handleRenameDevice(deviceId: string) {
    const label = deviceLabels[deviceId]?.trim();
    if (!label) return;
    await renameDevice({ deviceId, label });
    await loadBootstrap(true);
    pushToast("success", "Device label saved.");
  }

  async function handleRevokeDevice(deviceId: string) {
    await revokeDevice({ deviceId });
    await loadBootstrap(true);
    pushToast("success", "Device revoked.");
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your Synq account and messages from this demo?")) {
      return;
    }
    await deleteAccount({ confirm: "DELETE MY ACCOUNT" });
    await signOut({ callbackUrl: "/chat" });
  }

  if (authStage === "loading") {
    return (
      <GlassCard className="p-8 sm:p-10">
        <SectionLabel>Booting</SectionLabel>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">
          Restoring your Synq workspace...
        </h2>
        <div className="mt-6 grid gap-3">
          <div className="h-4 rounded-full bg-white/8" />
          <div className="h-4 w-2/3 rounded-full bg-white/8" />
          <div className="h-36 rounded-[28px] bg-white/[0.05]" />
        </div>
      </GlassCard>
    );
  }

  if (authStage !== "ready" || !state || !currentUser) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="p-8 sm:p-10">
          <SectionLabel>Sign in</SectionLabel>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">
            Enter Synq with Google and open your private network.
          </h2>
          <p className="mt-4 max-w-2xl text-white/65">
            Synq now supports real shared rooms, add-by-handle, privacy controls,
            reactions, replies, pins, voice notes, and safer account tools.
          </p>
          {authError ? (
            <div className="mt-6 rounded-[24px] border border-[#FF7A6E]/30 bg-[#FF7A6E]/10 px-4 py-3 text-sm text-[#FFD1CB]">
              {authError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            className="mt-8 rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019]"
          >
            Continue with Google
          </button>
        </GlassCard>
        <GlassCard className="p-6">
          <SectionLabel>Trust surface</SectionLabel>
          <div className="mt-4">
            <TrustOrb />
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!currentUser.onboardingComplete) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_420px]">
        <GlassCard className="synq-ambient synq-ambient--sealed p-8 sm:p-10">
          <SectionLabel>Onboarding</SectionLabel>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {ONBOARDING_STEPS.map((step, index) => {
              const isActive = onboardingStep === step.id;
              const isComplete =
                ONBOARDING_STEPS.findIndex((candidate) => candidate.id === onboardingStep) > index;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setOnboardingStep(step.id)}
                  className={cx(
                    "rounded-full border px-4 py-2 text-sm transition",
                    isActive
                      ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/12 text-white"
                      : isComplete
                        ? "border-[#98FFD5]/25 bg-[#98FFD5]/8 text-white/78"
                        : "border-white/10 bg-white/[0.04] text-white/48",
                  )}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
          <h2 className="mt-6 font-[family-name:var(--font-display)] text-4xl text-white">
            Shape how Synq sees you before you enter the network.
          </h2>
          <p className="mt-4 max-w-2xl text-white/62">
            The setup is split into identity, privacy, and final entry so the live app
            already feels like yours before the first message.
          </p>
          {authError ? (
            <div className="mt-6 rounded-[24px] border border-[#FF7A6E]/30 bg-[#FF7A6E]/10 px-4 py-3 text-sm text-[#FFD1CB]">
              {authError}
            </div>
          ) : null}

          {onboardingStep === "identity" ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-white/58">Display name</span>
                <input
                  value={onboardingName}
                  onChange={(event) => setOnboardingName(event.target.value)}
                  placeholder="Display name"
                  className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-white/58">Handle</span>
                <input
                  value={onboardingHandle}
                  onChange={(event) => setOnboardingHandle(event.target.value)}
                  placeholder="handle"
                  className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                />
              </label>
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 md:col-span-2">
                <p className="text-sm text-white/54">How you will appear at a glance</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="synq-sigil flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 text-lg font-semibold text-white">
                    {(onboardingHandle.trim()[0] ?? onboardingName.trim()[0] ?? "S").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white">
                      @{onboardingHandle.trim() || "your.handle"}
                    </p>
                    <p className="text-sm text-white/58">
                      {onboardingName.trim() || "Display name preview"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {onboardingStep === "privacy" ? (
            <div className="mt-8 grid gap-4">
              <div className="grid gap-3 rounded-[28px] border border-white/8 bg-white/[0.03] p-4 text-sm text-white/70">
                <label className="flex items-center justify-between gap-3">
                  <span>Ghost mode</span>
                  <input
                    type="checkbox"
                    checked={ghostMode}
                    onChange={(event) => setGhostMode(event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>Hide avatar</span>
                  <input
                    type="checkbox"
                    checked={onboardingHiddenAvatar}
                    onChange={(event) => setOnboardingHiddenAvatar(event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>Private discovery</span>
                  <input
                    type="checkbox"
                    checked={onboardingPrivateDiscovery}
                    onChange={(event) => setOnboardingPrivateDiscovery(event.target.checked)}
                  />
                </label>
                <div className="flex flex-wrap gap-2 pt-2">
                  {(["handle_only", "full"] as ProfileVisibility[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOnboardingVisibility(mode)}
                      className={cx(
                        "rounded-full border px-3 py-2 text-xs transition",
                        onboardingVisibility === mode
                          ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10 text-white"
                          : "border-white/10 text-white/55",
                      )}
                    >
                      {mode === "handle_only" ? "Handle only" : "Full name"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
                <p className="text-xs tracking-[0.28em] text-white/40">LIVE PREVIEW</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="synq-sigil flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 text-lg font-semibold text-white">
                    {onboardingHiddenAvatar
                      ? "--"
                      : (onboardingHandle.trim()[0] ?? onboardingName.trim()[0] ?? "S").toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-white">
                        {ghostMode || onboardingVisibility === "handle_only"
                          ? `@${onboardingHandle.trim() || "your.handle"}`
                          : onboardingName.trim() || "Display name"}
                      </p>
                      {ghostMode ? (
                        <StatusPill tone="mint" className="text-[10px] tracking-[0.18em]">
                          STEALTH
                        </StatusPill>
                      ) : null}
                    </div>
                    <p className="text-sm text-white/54">
                      {onboardingPrivateDiscovery
                        ? "Only exact-handle discovery is enabled."
                        : "People can discover you through search and shared spaces."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {onboardingStep === "enter" ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-white/58">Recovery email</span>
                <input
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  placeholder="Recovery email"
                  className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-white/58">Recovery phone</span>
                <input
                  value={recoveryPhone}
                  onChange={(event) => setRecoveryPhone(event.target.value)}
                  placeholder="Recovery phone"
                  className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                />
              </label>
              <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5 md:col-span-2">
                <p className="text-xs tracking-[0.28em] text-white/40">ENTRY CHECKLIST</p>
                <div className="mt-4 grid gap-3 text-sm text-white/68">
                  <p>Handle: @{onboardingHandle.trim() || "your.handle"}</p>
                  <p>Mode: {ghostMode ? "Ghost mode with a handle-first profile" : "Visible profile"}</p>
                  <p>
                    Discovery:{" "}
                    {onboardingPrivateDiscovery ? "Private and exact-handle only" : "Open inside Synq"}
                  </p>
                  <p>
                    Recovery:{" "}
                    {recoveryEmail.trim() || recoveryPhone.trim()
                      ? "At least one recovery path is set."
                      : "No recovery method yet; you can still add one later."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                const index = ONBOARDING_STEPS.findIndex((step) => step.id === onboardingStep);
                if (index > 0) {
                  setOnboardingStep(ONBOARDING_STEPS[index - 1].id);
                }
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/65"
            >
              Back
            </button>
            {onboardingStep !== "enter" ? (
              <button
                type="button"
                onClick={() => {
                  const index = ONBOARDING_STEPS.findIndex((step) => step.id === onboardingStep);
                  if (onboardingStep === "identity" && (!onboardingName.trim() || !onboardingHandle.trim())) {
                    setAuthError("Name and handle are required before you can continue.");
                    return;
                  }
                  setAuthError("");
                  setOnboardingStep(ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)].id);
                }}
                className="rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019]"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleOnboardingSubmit()}
                className="rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019]"
              >
                Enter Synq
              </button>
            )}
          </div>
        </GlassCard>
        <GlassCard className="p-6">
          <SectionLabel>Trust surface</SectionLabel>
          <div className="mt-4">
            <TrustOrb
              ghostMode={ghostMode}
              queuedCount={0}
              typing={onboardingStep === "privacy"}
              unreadCount={0}
              tone="sealed"
            />
          </div>
          <div className="mt-5 rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs tracking-[0.26em] text-white/40">IDENTITY RITUAL</p>
            <p className="mt-3 text-lg font-semibold text-white">
              {ghostMode || onboardingVisibility === "handle_only"
                ? `@${onboardingHandle.trim() || "your.handle"}`
                : onboardingName.trim() || "Display name"}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/58">
              Synq is handle-first, privacy-aware, and calmer by default. This preview updates
              live while you tune ghost mode, visibility, and recovery choices.
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {toasts.length ? (
          <div className="fixed bottom-4 right-4 z-50 grid gap-3">
            {toasts.map((toast) => (
              <motion.div key={toast.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: 8 }} className={`rounded-[22px] border px-4 py-3 text-sm shadow-2xl ${toast.tone === "error" ? "border-[#FF7A6E]/30 bg-[#FF7A6E]/12 text-[#FFD1CB]" : toast.tone === "success" ? "border-[#5DE4FF]/30 bg-[#5DE4FF]/12 text-[#D8FBFF]" : "border-white/10 bg-[#0D1420]/90 text-white/75"}`}>
                {toast.message}
              </motion.div>
            ))}
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileIdentityOpen ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion ? undefined : motionTokens.spring}
            className="fixed inset-0 z-40 bg-[#02050b]/72 backdrop-blur-sm xl:hidden"
            onClick={() => setIsMobileIdentityOpen(false)}
          >
            <motion.div
              initial={reduceMotion ? false : { y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduceMotion ? undefined : { y: 18, opacity: 0 }}
              transition={reduceMotion ? undefined : motionTokens.spring}
              onClick={(event) => event.stopPropagation()}
              className="absolute inset-x-3 bottom-3 top-20 flex flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#08111C]/95 shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
                <div>
                  <p className="text-base font-semibold text-white">Identity and spaces</p>
                  <p className="mt-1 text-sm leading-6 text-white/54">
                    Keep chat primary, then switch context when you need it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileIdentityOpen(false)}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/68 transition hover:border-white/18 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="synq-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="relative rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
                  <button
                    type="button"
                    onClick={() => handleOpenProfileDock(true)}
                    className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/72 transition hover:border-white/18 hover:text-white"
                    aria-label="Open profile panel"
                  >
                    <ProfilePanelIcon />
                  </button>
                  <div className="flex items-start gap-4 pr-12">
                    <div className="synq-sigil flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-white/10 text-lg font-semibold text-white">
                      {displayAvatar(currentUser)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-semibold text-white">
                          {displayIdentity(currentUser)}
                        </p>
                        {currentUser?.ghostMode ? (
                          <StatusPill tone="mint" className="text-[10px] tracking-[0.16em]">
                            STEALTH
                          </StatusPill>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/56">
                        {currentUser?.bio || "Quiet by default. Ready for private signals."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    <span>{totalUnreadCount} unread</span>
                    <span>|</span>
                    <span>{connectionLabel}</span>
                    <span>|</span>
                    <span>{queueCount} queued</span>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-white">Spaces</p>
                      <p className="mt-1 text-sm leading-6 text-white/52">
                        Move between direct signals, shared rooms, and broadcasts.
                      </p>
                    </div>
                    {totalUnreadCount ? <StatusPill tone="coral">{totalUnreadCount} unread</StatusPill> : null}
                  </div>
                  <div className="mt-4 grid gap-2.5">
                    {spaceItems.map((space) => (
                      <button
                        key={`mobile-${space.id}`}
                        type="button"
                        onClick={() => handleSelectWorkspace(space.id, true)}
                        className={cx(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          space.id === selectedWorkspaceId
                            ? "border-[#5DE4FF]/38 bg-[linear-gradient(135deg,rgba(93,228,255,0.14),rgba(255,122,110,0.07))] shadow-[0_16px_38px_rgba(7,16,26,0.24)]"
                            : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.055]",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="synq-sigil flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 text-sm font-semibold text-white">
                            {renderSpaceIcon(space)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate font-medium text-white">{space.name}</p>
                              {space.unreadCount ? (
                                <span className="rounded-full bg-[#FF7A6E] px-2 py-1 text-[11px] font-semibold text-[#071019]">
                                  {space.unreadCount}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-sm text-white/54">{space.caption}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-6 border-t border-white/8 pt-4">
                  <button
                    type="button"
                    onClick={() => void signOut({ callbackUrl: "/chat" })}
                    className="text-sm text-white/56 transition hover:text-white/82"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isProfileFlyoutOpen ? (
          <motion.div
            className="fixed inset-0 z-40 bg-[#02060B]/55 px-4 py-6 backdrop-blur-sm xl:hidden"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            onClick={() => setIsProfileFlyoutOpen(false)}
          >
            <motion.div
              ref={profileFlyoutRef}
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
              transition={reduceMotion ? undefined : motionTokens.spring}
              onClick={(event) => event.stopPropagation()}
              className="mx-auto mt-16 max-w-[420px]"
            >
              <GlassCard className="p-3 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
                <div className="mb-3 flex items-center justify-between px-2">
                  <SectionLabel>Profile</SectionLabel>
                  <button
                    type="button"
                    onClick={() => setIsProfileFlyoutOpen(false)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/58 transition hover:border-white/18 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                {profileFlyoutBody}
              </GlassCard>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className={cx(
          "grid gap-4 xl:h-full xl:min-h-0",
          isDockCollapsed
            ? "xl:grid-cols-[112px_292px_minmax(0,1.62fr)_92px] 2xl:grid-cols-[120px_304px_minmax(0,1.82fr)_92px]"
            : "xl:grid-cols-[112px_292px_minmax(0,1.5fr)_348px] 2xl:grid-cols-[120px_304px_minmax(0,1.72fr)_360px]",
        )}
      >
        <motion.aside
          layout
          transition={reduceMotion ? undefined : motionTokens.spring}
          className="relative hidden xl:block xl:h-full xl:min-h-0"
        >
          <GlassCard className="flex h-full min-h-0 flex-col items-center p-3">
            <button
              type="button"
              onClick={() => handleOpenProfileDock()}
              className="self-end rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/72 transition hover:border-white/18 hover:text-white"
              aria-label="Open profile panel"
            >
              <ProfilePanelIcon />
            </button>

            <div className="mt-5 flex flex-1 flex-col items-center text-center">
              <div className="synq-sigil flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 text-lg font-semibold text-white">
                {displayAvatar(currentUser)}
              </div>
              <p className="mt-4 w-full truncate text-sm font-semibold text-white">
                {displayIdentity(currentUser)}
              </p>
              {currentUser?.ghostMode ? (
                <StatusPill tone="mint" className="mt-3 text-[10px] tracking-[0.16em]">
                  STEALTH
                </StatusPill>
              ) : null}
              <p className="mt-4 text-xs leading-6 text-white/42">
                {queueCount} queued
              </p>
            </div>

            <div className="mt-4 w-full border-t border-white/8 pt-3">
              <p className="text-center text-[11px] text-white/34">{connectionLabel}</p>
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/chat" })}
                className="mt-3 w-full rounded-full border border-white/10 px-3 py-2.5 text-sm text-white/56 transition hover:border-white/18 hover:text-white/82"
              >
                Sign out
              </button>
            </div>
          </GlassCard>
          <AnimatePresence initial={false}>
            {isProfileFlyoutOpen ? (
              <motion.div
                ref={profileFlyoutRef}
                initial={reduceMotion ? false : { opacity: 0, x: -12, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -8, scale: 0.98 }}
                transition={reduceMotion ? undefined : motionTokens.spring}
                className="absolute left-[calc(100%+1rem)] top-0 z-30 hidden w-[360px] xl:block"
              >
                <GlassCard className="p-3 shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
                  <div className="mb-3 flex items-center justify-between px-2">
                    <SectionLabel>Profile</SectionLabel>
                    <button
                      type="button"
                      onClick={() => setIsProfileFlyoutOpen(false)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/58 transition hover:border-white/18 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  {profileFlyoutBody}
                </GlassCard>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.aside>

        <div className="xl:hidden">
          <GlassCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsMobileIdentityOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="synq-sigil flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 text-sm font-semibold text-white">
                  {displayAvatar(currentUser)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{displayIdentity(currentUser)}</p>
                  <p className="mt-1 truncate text-sm text-white/52">
                    {selectedSpace.name} - {selectedSpace.caption}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsMobileIdentityOpen(true)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/72 transition hover:border-white/18 hover:text-white"
              >
                Spaces
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/65">
                <span className="text-white/78">{renderSpaceIcon(selectedSpace)}</span>
                {selectedSpace.name}
              </span>
              {selectedSpace.unreadCount ? (
                <StatusPill tone="coral">{selectedSpace.unreadCount} unread</StatusPill>
              ) : null}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="flex min-h-0 flex-col p-4 transition xl:h-full">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SectionLabel>Signal inbox</SectionLabel>
              <h2 className="mt-1 truncate text-lg font-semibold text-white">{selectedSpace.name}</h2>
              <p className="mt-1 text-sm leading-5 text-white/50">
                {selectedSpace.kind === "direct"
                  ? "Private threads you explicitly start."
                  : selectedSpace.caption}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {selectedSpace.unreadCount ? (
                <StatusPill tone="coral">{selectedSpace.unreadCount} unread</StatusPill>
              ) : null}
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/56">
                {visibleConversations.length} room{visibleConversations.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {spaceItems.map((space) => (
              <button
                key={`inbox-space-${space.id}`}
                type="button"
                title={space.name}
                aria-label={space.name}
                onClick={() => handleSelectWorkspace(space.id)}
                className={cx(
                  "relative flex h-12 items-center justify-center rounded-[18px] border transition",
                  space.id === selectedWorkspaceId
                    ? "border-[#5DE4FF]/32 bg-[linear-gradient(135deg,rgba(93,228,255,0.14),rgba(255,122,110,0.08))] text-white shadow-[0_12px_22px_rgba(7,16,26,0.18)]"
                    : "border-white/8 bg-white/[0.03] text-white/74 hover:border-white/14 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <span className="text-white">{renderSpaceIcon(space)}</span>
                <span className="sr-only">{space.name}</span>
                {space.unreadCount ? (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-[#FF7A6E] px-1.5 py-[2px] text-[10px] font-semibold leading-none text-[#071019]">
                    {space.unreadCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-[22px] border border-white/7 bg-black/12 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Room actions</p>
                <p className="mt-0.5 text-xs text-white/42">
                  Create a new room or join one with a code.
                </p>
              </div>
              <button
                type="button"
                aria-expanded={!isRoomActionsCollapsed}
                aria-label={isRoomActionsCollapsed ? "Expand room actions" : "Collapse room actions"}
                onClick={() => setIsRoomActionsCollapsed((current) => !current)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/72 transition hover:border-white/18 hover:text-white"
              >
                {isRoomActionsCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {isRoomActionsCollapsed ? null : (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, height: 0, y: -8 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, height: 0, y: -6 }}
                  transition={reduceMotion ? undefined : motionTokens.spring}
                  className="overflow-hidden"
                >
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-[22px] border border-white/8 bg-black/12 p-3">
                      <div className="grid gap-2">
                        <input
                          value={roomTitle}
                          onChange={(event) => setRoomTitle(event.target.value)}
                          placeholder="New room title"
                          className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                        />
                        <input
                          value={roomSubtitle}
                          onChange={(event) => setRoomSubtitle(event.target.value)}
                          placeholder="Room subtitle"
                          className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                        />
                        <input
                          value={roomHandles}
                          onChange={(event) => setRoomHandles(event.target.value)}
                          placeholder="Invite handles, comma separated"
                          className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateRoom()}
                          className="rounded-full border border-[#5DE4FF]/30 bg-[#5DE4FF]/10 px-3 py-2 text-sm text-white transition hover:border-[#5DE4FF]/45 hover:bg-[#5DE4FF]/14"
                        >
                          Create room
                        </button>
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/8 bg-black/12 p-3">
                      <div className="grid gap-2">
                        <input
                          value={joinCode}
                          onChange={(event) => setJoinCode(event.target.value)}
                          placeholder="Join code"
                          className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleJoinRoom()}
                          className="rounded-full border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:border-white/18 hover:text-white/88"
                        >
                          Join by code
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="synq-scroll mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {visibleConversations.length ? (
              visibleConversations.map((conversation) => (
                <motion.button
                  key={conversation.id}
                  type="button"
                  layout
                  transition={reduceMotion ? undefined : motionTokens.spring}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cx(
                    "w-full rounded-[26px] border p-4 text-left transition",
                    conversation.id === selectedConversation?.id
                      ? "border-[#5DE4FF]/40 bg-[linear-gradient(135deg,rgba(93,228,255,0.14),rgba(255,122,110,0.08))] shadow-[0_10px_24px_rgba(7,16,26,0.16)]"
                      : "border-white/8 bg-white/[0.04] hover:border-white/14 hover:bg-white/[0.06]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="synq-sigil flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 text-sm font-semibold text-white">
                      {roomGlyph(conversation)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{conversation.title}</p>
                          <p className="truncate text-sm text-white/55">{conversation.subtitle}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {conversation.unreadCount ? (
                            <span className="rounded-full bg-[#FF7A6E] px-2 py-1 text-[11px] font-semibold text-[#071019]">
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                          <StatusPill
                            tone={
                              conversation.visibility === "e2ee"
                                ? "mint"
                                : conversation.kind === "creator_channel"
                                  ? "coral"
                                  : "cyan"
                            }
                          >
                            {toneLabel(conversation)}
                          </StatusPill>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/55">
                        {conversation.lastMessagePreview}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                        <span>{conversation.kind.replaceAll("_", " ")}</span>
                        <span>{formatClock(conversation.lastActivityAt)}</span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))
            ) : (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-sm leading-6 text-white/55">
                {selectedSpace.kind === "direct"
                  ? "No direct signals yet. Open one from Find people in your profile panel."
                  : "No rooms in this space yet. Create one, share a join code, or wait for a new signal."}
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard
          className={cx(
            "relative flex min-h-[760px] flex-col overflow-hidden xl:h-full xl:min-h-0",
            conversationAmbientClass(selectedConversation),
          )}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-40 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.08),_transparent_70%)] blur-3xl" />
          <div className="shrink-0 border-b border-white/8 bg-[#08111c]/82 px-5 py-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <div className="synq-sigil mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-white/10 text-sm font-semibold text-white">
                  {roomGlyph(selectedConversation)}
                </div>
                <div className="min-w-0">
                  <SectionLabel>Conversation</SectionLabel>
                  <h2 className="mt-2 truncate text-2xl font-semibold text-white">
                    {selectedConversation?.title || "Pick a room"}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/55">
                    <span>{selectedConversation?.subtitle || "Select a room from the inbox to continue."}</span>
                    {selectedConversation?.joinCode ? (
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] tracking-[0.16em] text-white/56">
                        CODE {selectedConversation.joinCode}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusPill tone={selectedConversation?.visibility === "e2ee" ? "mint" : "cyan"}>
                  {selectedConversation?.visibility === "e2ee" ? "sealed room" : "shared room"}
                </StatusPill>
                {queueCount ? <StatusPill tone="coral">{queueCount} queued</StatusPill> : null}
                {typingUsers.length ? <StatusPill tone="mint">live typing</StatusPill> : null}
                <div className="relative" ref={utilitiesRef}>
                  <button
                    type="button"
                    aria-label="Open conversation tools"
                    aria-expanded={isUtilitiesOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsUtilitiesOpen((current) => !current)}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/78 transition hover:border-white/18 hover:bg-white/[0.08]"
                  >
                    Tools
                  </button>
                  <AnimatePresence initial={false}>
                    {isUtilitiesOpen ? (
                      <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                        transition={reduceMotion ? undefined : motionTokens.spring}
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.6rem)] z-20 min-w-[220px] rounded-[22px] border border-white/10 bg-[#09111C]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleOpenSearchFromUtilities}
                          className="w-full rounded-[16px] px-3 py-3 text-left text-sm text-white/80 transition hover:bg-white/[0.06]"
                        >
                          Search messages
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleRefreshAiDock()}
                          className="w-full rounded-[16px] px-3 py-3 text-left text-sm text-white/80 transition hover:bg-white/[0.06]"
                        >
                          Refresh AI dock
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isSearchOpen ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, height: 0, y: -8 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, height: 0, y: -6 }}
                  transition={reduceMotion ? undefined : motionTokens.spring}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <input
                        ref={searchInputRef}
                        value={messageSearch}
                        onChange={(event) => setMessageSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            closeSearchPanel();
                          }
                        }}
                        placeholder="Search this conversation"
                        className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/55">
                          {messageSearch.trim()
                            ? `${filteredMessages.length} ${filteredMessages.length === 1 ? "match" : "matches"}`
                            : "Filter loaded messages"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMessageSearch("")}
                          className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/60 transition hover:border-white/16 hover:text-white/88"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={closeSearchPanel}
                          className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/60 transition hover:border-white/16 hover:text-white/88"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {pinnedMessages.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {pinnedMessages.slice(0, 3).map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => openSearchPanel(message.preview)}
                    className="rounded-full border border-[#FFCF86]/20 bg-[linear-gradient(135deg,rgba(255,122,110,0.12),rgba(255,207,134,0.1))] px-4 py-2 text-xs text-white/76 transition hover:border-[#FFCF86]/34"
                  >
                    Pin {message.preview.slice(0, 48)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              ref={messageListRef}
              className="synq-scroll h-full min-h-[320px] space-y-1 overflow-y-auto overscroll-contain px-5 py-6 xl:min-h-0"
            >
              <AnimatePresence initial={false}>
                {decoratedMessages.length ? (
                  decoratedMessages.map(({ message, groupedWithPrevious, groupedWithNext }) => {
                    const mine = message.senderId === currentUser.id;
                    const authorUser = state.users.find((user) => user.id === message.senderId);
                    const author = displayIdentity(authorUser);
                    const replySource = resolvedMessages.find(
                      (candidate) =>
                        candidate.id === message.replyToId || candidate.clientId === message.replyToId,
                    );
                    const isPinned = pinnedMessages.some((pinned) => pinned.id === message.id);
                    return (
                      <motion.div
                        key={message.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                        transition={reduceMotion ? undefined : motionTokens.spring}
                        className={cx(
                          "flex",
                          mine ? "justify-end" : "justify-start",
                          groupedWithPrevious ? "mt-1" : "mt-6",
                        )}
                      >
                        <div className={cx("max-w-[88%]", mine ? "items-end" : "items-start")}>
                          {!groupedWithPrevious ? (
                            <div
                              className={cx(
                                "mb-2 flex items-center gap-3 text-sm text-white/48",
                                mine ? "justify-end" : "justify-start",
                              )}
                            >
                              {!mine ? (
                                <div className="synq-sigil flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10 text-xs font-semibold text-white">
                                  {displayAvatar(authorUser)}
                                </div>
                              ) : null}
                              <div className={cx("flex items-center gap-2", mine ? "flex-row-reverse" : "")}>
                                <span className="font-medium text-white/76">{mine ? "You" : author}</span>
                                <span className="text-xs tracking-[0.14em] text-white/34">
                                  {formatClock(message.createdAt)}
                                </span>
                              </div>
                            </div>
                          ) : null}
                          <div
                            className={cx(
                              "relative overflow-hidden border px-4 py-3 text-white shadow-[0_20px_60px_rgba(5,10,18,0.24)]",
                              mine
                                ? "border-[#5DE4FF]/18 bg-[linear-gradient(135deg,rgba(93,228,255,0.18),rgba(255,122,110,0.14))]"
                                : "border-white/8 bg-white/[0.05]",
                              groupedWithPrevious && mine && "rounded-tr-[16px]",
                              groupedWithPrevious && !mine && "rounded-tl-[16px]",
                              groupedWithNext && mine && "rounded-br-[16px]",
                              groupedWithNext && !mine && "rounded-bl-[16px]",
                              "rounded-[28px]",
                            )}
                          >
                            <div
                              className={cx(
                                "absolute inset-y-0 w-[2px] rounded-full",
                                mine ? "right-0 bg-[#FFB39D]/35" : "left-0 bg-[#5DE4FF]/35",
                              )}
                            />
                            {replySource ? (
                              <div className="mt-1 flex gap-3 rounded-[20px] border border-white/10 bg-black/20 px-3 py-3">
                                <div className="w-1 rounded-full bg-[#5DE4FF]/70" />
                                <div className="min-w-0">
                                  <p className="text-[11px] tracking-[0.18em] text-white/40">
                                    REPLYING TO {displayIdentity(
                                      state.users.find((user) => user.id === replySource.senderId),
                                    )}
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/62">
                                    {replySource.preview}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                            <p className="mt-2 text-[1rem] leading-8 text-white/92">{message.preview}</p>
                            {message.attachments.length ? (
                              <div className="mt-4 grid gap-3">
                                {message.attachments.map((attachment) => {
                                  const kind = attachmentKind(attachment);
                                  return (
                                    <div
                                      key={attachment.id}
                                      className="overflow-hidden rounded-[22px] border border-white/10 bg-black/18"
                                    >
                                      {kind === "image" ? (
                                        <div className="h-28 bg-[linear-gradient(135deg,rgba(93,228,255,0.18),rgba(255,122,110,0.12))] p-4">
                                          <div className="h-full rounded-[18px] border border-white/12 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)]" />
                                        </div>
                                      ) : kind === "voice" ? (
                                        <div className="flex items-end gap-1 px-4 pt-5">
                                          {[16, 24, 12, 28, 18, 30, 14, 20, 26, 14].map((height, index) => (
                                            <span
                                              key={`${attachment.id}_${height}_${index}`}
                                              className="w-1 rounded-full bg-[#5DE4FF]/62"
                                              style={{ height }}
                                            />
                                          ))}
                                        </div>
                                      ) : null}
                                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-white">
                                            {attachment.name}
                                          </p>
                                          <p className="mt-1 text-xs tracking-[0.18em] text-white/42">
                                            {kind === "voice"
                                              ? "VOICE NOTE"
                                              : kind === "image"
                                                ? "IMAGE"
                                                : "FILE"}{" "}
                                            {formatAttachmentSize(attachment.size)}
                                          </p>
                                        </div>
                                        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/56">
                                          {kind === "file"
                                            ? (attachment.name.split(".").pop() ?? "FILE").toUpperCase()
                                            : kind.toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {message.reactions.length ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {Object.entries(
                                  message.reactions.reduce<Record<string, number>>((accumulator, reaction) => {
                                    accumulator[reaction.emoji] = (accumulator[reaction.emoji] ?? 0) + 1;
                                    return accumulator;
                                  }, {}),
                                ).map(([emoji, count]) => (
                                  <span
                                    key={emoji}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/74"
                                  >
                                    {emoji} {count}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/54">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void handleReaction(message.id, emoji)}
                                  className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setReplyToMessageId(message.id)}
                                className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                              >
                                Reply
                              </button>
                              <button
                                type="button"
                                onClick={() => void handlePin(message.id, !isPinned)}
                                className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                              >
                                {isPinned ? "Unpin" : "Pin"}
                              </button>
                              {mine || canModerate ? (
                                <>
                                  {mine ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMessageId(message.id);
                                        setDraft(message.preview);
                                      }}
                                      className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                                    >
                                      Edit
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteMessage(message.id)}
                                    className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleReport(message.id)}
                                    className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                                  >
                                    Report
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleBlock(message.senderId)}
                                    className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/18 hover:text-white"
                                  >
                                    Block
                                  </button>
                                </>
                              )}
                            </div>
                            <p className="mt-3 text-xs tracking-[0.16em] text-white/38">
                              {message.deletedAt
                                ? "DELETED"
                                : message.editedAt
                                  ? "EDITED"
                                  : message.status === "queued"
                                    ? "QUEUED FOR REPLAY"
                                    : selectedConversation?.visibility === "e2ee"
                                      ? "LOCAL VAULT RENDER"
                                      : "MANAGED VISIBLE"}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm leading-6 text-white/55">
                    {messageSearch
                      ? "No messages matched that search."
                      : "This room is calm right now. Send the first signal or share a join code with your friends."}
                  </div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {showJumpToLatest ? (
                <motion.button
                  type="button"
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                  transition={reduceMotion ? undefined : motionTokens.spring}
                  onClick={() => scrollConversationToLatest()}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#09111C]/92 px-4 py-2 text-sm text-white/78 shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
                >
                  Jump to latest
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="border-t border-white/8 bg-black/10 px-5 py-4">
            {typingUsers.length ? (
              <div className="mb-3 rounded-[18px] border border-[#5DE4FF]/20 bg-[#5DE4FF]/8 px-3 py-2 text-sm text-[#D8FBFF]">
                {typingUsers.map((user) => displayIdentity(user)).join(", ")} typing...
              </div>
            ) : null}
            {replyTarget || editingMessageId ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                <div>
                  {editingMessageId
                    ? "Editing your message"
                    : `Replying to ${displayIdentity(
                        state.users.find((user) => user.id === replyTarget?.senderId),
                      )}`}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReplyToMessageId("");
                    setEditingMessageId("");
                    setDraft("");
                  }}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 transition hover:border-white/18 hover:text-white/88"
                >
                  Clear
                </button>
              </div>
            ) : null}
            {pendingAttachments.length ? (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {pendingAttachments.map((attachment) => {
                  const kind = attachmentKind(attachment);
                  return (
                    <div
                      key={attachment.id}
                      className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/76"
                    >
                      <p className="font-medium text-white">{attachment.name}</p>
                      <p className="mt-1 text-xs tracking-[0.16em] text-white/42">
                        {kind.toUpperCase()} {formatAttachmentSize(attachment.size)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder={
                selectedConversation
                  ? "Write a signal, search memory, or leave a reply..."
                  : "Pick a room to start chatting."
              }
              disabled={!selectedConversation}
              className="w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-white/35"
            />
            {composerError ? (
              <div className="mt-3 rounded-[18px] border border-[#FF7A6E]/25 bg-[#FF7A6E]/10 px-3 py-2 text-sm text-[#FFD1CB]">
                {composerError}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center rounded-full border border-white/10 px-4 text-xs text-white/74 transition hover:border-white/18 hover:text-white">
                  Attach
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleStageAttachment(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleVoiceNote()}
                  className={`inline-flex h-10 items-center rounded-full border px-4 text-xs transition ${
                    recordingVoice
                      ? "border-[#FF7A6E]/40 bg-[#FF7A6E]/12 text-[#FFD1CB]"
                      : "border-white/10 text-white/74 hover:border-white/18 hover:text-white"
                  }`}
                >
                  {recordingVoice ? "Stop voice" : "Voice note"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(ghostRewrite);
                    pushToast("info", "Ghost rewrite applied locally.");
                  }}
                  className="inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-xs text-white/74 transition hover:border-white/18 hover:text-white"
                >
                  Ghost rewrite
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!selectedConversation}
                className="inline-flex h-10 items-center rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-5 text-sm font-medium text-[#071019] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editingMessageId ? "Save edit" : "Send signal"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
              <span>{attachmentState}</span>
              <span>
                {selectedConversation?.visibility === "e2ee"
                  ? "Sealed room: previews stay local."
                  : "Managed room: shared history sync is enabled."}
              </span>
            </div>
          </div>
        </GlassCard>

        <GlassCard
          className={cx(
            "xl:h-full xl:min-h-0",
            isDockCollapsed ? "overflow-visible p-3" : "overflow-hidden p-4",
          )}
        >
          <div
            className={cx(
              "synq-scroll synq-scroll--subtle flex min-h-0 overflow-y-auto overscroll-contain xl:h-full",
              isDockCollapsed ? "flex-col items-center gap-3" : "flex-col pr-2",
            )}
          >
            <div className={cx("flex items-center", isDockCollapsed ? "justify-center" : "justify-between")}>
              {isDockCollapsed ? null : <SectionLabel>Dock</SectionLabel>}
              <button
                type="button"
                aria-label={isDockCollapsed ? "Expand dock" : "Collapse dock"}
                onClick={() => setIsDockCollapsed((current) => !current)}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/72 transition hover:border-white/18 hover:text-white"
              >
                <DockToggleIcon collapsed={isDockCollapsed} />
              </button>
            </div>
            {isDockCollapsed ? (
              <div className="mt-2 flex flex-1 flex-col items-center gap-3">
                <button
                  type="button"
                  title="Expand dock"
                  aria-label="Expand dock with live orb"
                  onClick={() => {
                    setActiveDockTab("memory");
                    setIsDockCollapsed(false);
                  }}
                  className="rounded-[18px] text-white/78 transition"
                >
                  <MiniDockOrb
                    tone={conversationTone(selectedConversation)}
                    active
                  />
                </button>
                <button
                  type="button"
                  title="Memory"
                  aria-label="Open Memory dock tab"
                  data-active={activeDockTab === "memory"}
                  onClick={() => {
                    setActiveDockTab("memory");
                    setIsDockCollapsed(false);
                  }}
                  className="synq-tab flex h-12 w-12 items-center justify-center rounded-[18px] text-white/78"
                >
                  {renderDockTabIcon("memory")}
                </button>
                <button
                  type="button"
                  title="Safety"
                  aria-label="Open Safety dock tab"
                  data-active={activeDockTab === "safety"}
                  onClick={() => {
                    setActiveDockTab("safety");
                    setIsDockCollapsed(false);
                  }}
                  className="synq-tab flex h-12 w-12 items-center justify-center rounded-[18px] text-white/78"
                >
                  {renderDockTabIcon("safety")}
                </button>
                <button
                  type="button"
                  title="AI"
                  aria-label="Open AI dock tab"
                  data-active={activeDockTab === "ai"}
                  onClick={() => {
                    setActiveDockTab("ai");
                    setIsDockCollapsed(false);
                  }}
                  className="synq-tab flex h-12 w-12 items-center justify-center rounded-[18px] text-white/78"
                >
                  {renderDockTabIcon("ai")}
                </button>
              </div>
            ) : (
              <>
            <div className="mt-4">
              <TrustOrb
                ghostMode={currentUser.ghostMode}
                queuedCount={queueCount}
                typing={Boolean(typingUsers.length) || recordingVoice}
                unreadCount={selectedConversation?.unreadCount ?? totalUnreadCount}
                tone={conversationTone(selectedConversation)}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {DOCK_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-active={activeDockTab === tab.id}
                  onClick={() => setActiveDockTab(tab.id)}
                  className="synq-tab rounded-[18px] px-3 py-3 text-left"
                >
                  <p className="text-sm font-medium">{tab.label}</p>
                  <p className="mt-1 text-[11px] leading-5 text-current/70">{tab.caption}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-4">
            {activeDockTab === "memory" ? (
              <GlassCard className="p-4">
                <div className="flex items-center justify-between">
                  <SectionLabel>Memory</SectionLabel>
                  <StatusPill tone="mint">
                    {selectedConversation?.visibility === "e2ee" ? "Local" : "Shared"}
                  </StatusPill>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/40">Summary</p>
                    <p className="mt-2 text-sm leading-6 text-white/75">{localSummary}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/40">Relationship memory</p>
                    <p className="mt-2 text-sm leading-6 text-white/75">{relationshipMemory}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/40">Pinned signals</p>
                    <div className="mt-2 grid gap-2">
                      {pinnedMessages.length ? (
                        pinnedMessages.slice(0, 4).map((message) => (
                          <button
                            key={message.id}
                            type="button"
                            onClick={() => openSearchPanel(message.preview)}
                            className="rounded-[16px] border border-white/10 bg-black/20 px-3 py-3 text-left text-sm text-white/72 transition hover:border-white/18"
                          >
                            {message.preview}
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-white/55">
                          Pin a message to keep important context floating here.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ) : null}
            {activeDockTab === "ai" ? (
              <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>AI and memory</SectionLabel>
              <StatusPill tone="coral">
                {selectedConversation?.visibility === "e2ee" ? "Local only" : "Workspace"}
              </StatusPill>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Summary</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{localSummary}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Ghost rewrite preview</p>
                <p className="mt-2 text-sm leading-6 text-white/75">
                  {ghostRewrite || "Start typing to generate a softer, more cinematic rewrite."}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Workspace AI</p>
                <p className="mt-2 text-sm leading-6 text-white/75">
                  {cloudResult || "Run the AI dock to generate shared memory cards or local summaries."}
                </p>
                <button
                  type="button"
                  onClick={() => void handleWorkspaceAI()}
                  className="mt-4 rounded-full border border-[#5DE4FF]/30 bg-[#5DE4FF]/10 px-4 py-2 text-sm text-white transition hover:border-[#5DE4FF]/42 hover:bg-[#5DE4FF]/14"
                >
                  Refresh AI dock
                </button>
              </div>
            </div>
              </GlassCard>
            ) : null}

            {activeDockTab === "safety" ? (
              <>
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Devices and safety</SectionLabel>
              <StatusPill tone="mint">{currentDevice ? currentDevice.trustState : "offline"}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3">
              {state.devices
                .filter((device) => device.userId === currentUser.id)
                .map((device) => (
                  <div
                    key={device.id}
                    className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{device.label}</p>
                        <p className="text-xs text-white/45">
                          {device.id === currentDevice?.id ? "Current device" : "Session device"} -{" "}
                          {device.trustState}
                        </p>
                      </div>
                      <StatusPill tone={device.id === currentDevice?.id ? "mint" : "cyan"}>
                        {device.id === currentDevice?.id ? "Current" : "Trusted"}
                      </StatusPill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        value={deviceLabels[device.id] ?? device.label}
                        onChange={(event) =>
                          setDeviceLabels((current) => ({
                            ...current,
                            [device.id]: event.target.value,
                          }))
                        }
                        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRenameDevice(device.id)}
                        className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/70"
                      >
                        Save
                      </button>
                      {device.id !== currentDevice?.id ? (
                        <button
                          type="button"
                          onClick={() => void handleRevokeDevice(device.id)}
                          className="rounded-full border border-[#FF7A6E]/30 px-3 py-2 text-xs text-[#FFD1CB]"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
            <div className="mt-4 rounded-[20px] border border-[#FF7A6E]/20 bg-[#FF7A6E]/8 p-3">
              <p className="text-sm text-[#FFD1CB]">
                Delete account removes your profile, devices, messages, and memberships from this
                demo environment.
              </p>
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                className="mt-3 rounded-full border border-[#FF7A6E]/30 px-3 py-2 text-xs text-[#FFD1CB]"
              >
                Delete account
              </button>
            </div>
            {state.blockRecords.some((record) => record.blockerUserId === currentUser.id) ? (
              <div className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Blocked handles</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state.blockRecords
                    .filter((record) => record.blockerUserId === currentUser.id)
                    .map((record) => state.users.find((user) => user.id === record.blockedUserId))
                    .filter(Boolean)
                    .map((user) => (
                      <span
                        key={user!.id}
                        className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/60"
                      >
                        {displayIdentity(user)}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Reports</SectionLabel>
              <StatusPill tone={canModerate ? "coral" : "cyan"}>
                {canModerate ? "Moderator" : "Personal"}
              </StatusPill>
            </div>
            <div className="mt-4 grid gap-3">
              {state.reports.length ? (
                state.reports.slice(0, 5).map((report) => (
                  <div
                    key={report.id}
                    className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3"
                  >
                    <p className="text-sm font-medium text-white">{report.reason}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {displayIdentity(
                        state.users.find((user) => user.id === report.reporterUserId),
                      )}{" "}
                      - {formatClock(report.createdAt)}
                    </p>
                    {report.note ? (
                      <p className="mt-2 text-sm text-white/65">{report.note}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-white/55">
                  No moderation reports yet.
                </div>
              )}
            </div>
          </GlassCard>
          </>
            ) : null}
            </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>
    </>
  );
}

