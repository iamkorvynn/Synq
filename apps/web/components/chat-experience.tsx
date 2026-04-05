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
import { signOut, useSession } from "next-auth/react";
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
import { GlassCard, SectionLabel, StatusPill, motionTokens } from "@synq/ui";

import {
  blockUser,
  completeOnboarding,
  connectRealtime,
  createConversation,
  deleteAccount,
  deleteMessage,
  editMessage,
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
  runAIAction,
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
  buildRelationshipMemory,
  rewriteWithGhostMode,
  summarizeConversation,
} from "@/lib/local-ai";
import {
  enqueueMessage,
  flushQueuedMessages,
  getQueuedMessages,
} from "@/lib/offline-queue";
import { sealPreviewForRecipient } from "@/lib/session-crypto";

import { TrustOrb } from "./trust-orb";

type AuthStage = "loading" | "signed_out" | "ready";
type ToastTone = "success" | "error" | "info";

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

const QUICK_REACTIONS = ["👍", "🔥", "🫶", "👀"];

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
  const deferredDraft = useDeferredValue(draft);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
  const localSummary = useMemo(
    () =>
      summarizeConversation(
        resolvedMessages as MessageEnvelope[],
        state?.users ?? [],
        state?.currentUserId ?? "",
      ),
    [resolvedMessages, state?.currentUserId, state?.users],
  );
  const relationshipMemory = useMemo(
    () =>
      buildRelationshipMemory(
        resolvedMessages as MessageEnvelope[],
        state?.users ?? [],
        state?.currentUserId ?? "",
      ),
    [resolvedMessages, state?.currentUserId, state?.users],
  );
  const ghostRewrite = useMemo(() => rewriteWithGhostMode(deferredDraft), [deferredDraft]);
  const typingUsers = useMemo(
    () =>
      (selectedConversation?.typingUserIds ?? [])
        .filter((userId) => userId !== currentUser?.id)
        .map((userId) => state?.users.find((user) => user.id === userId))
        .filter(Boolean) as User[],
    [currentUser?.id, selectedConversation?.typingUserIds, state?.users],
  );

  function pushToast(tone: ToastTone, message: string) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
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

  function handleGoogleSignIn() {
    window.location.assign("/api/auth/start/google");
  }

  async function handleStageAttachment(file: File) {
    try {
      setAttachmentState(`Encrypting ${file.name}...`);
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
    } catch {
      setAttachmentState("Attachment staging failed.");
      setComposerError("Synq could not encrypt and stage that file.");
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
    } catch {
      pushToast("error", "Synq could not deliver that signal.");
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
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="p-8 sm:p-10">
          <SectionLabel>Onboarding</SectionLabel>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">
            Finish your identity and privacy defaults.
          </h2>
          {authError ? (
            <div className="mt-6 rounded-[24px] border border-[#FF7A6E]/30 bg-[#FF7A6E]/10 px-4 py-3 text-sm text-[#FFD1CB]">
              {authError}
            </div>
          ) : null}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <input value={onboardingName} onChange={(event) => setOnboardingName(event.target.value)} placeholder="Display name" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" />
            <input value={onboardingHandle} onChange={(event) => setOnboardingHandle(event.target.value)} placeholder="handle" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" />
            <input value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="Recovery email" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" />
            <input value={recoveryPhone} onChange={(event) => setRecoveryPhone(event.target.value)} placeholder="Recovery phone" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" />
          </div>
          <div className="mt-6 grid gap-3 rounded-[28px] border border-white/8 bg-white/[0.03] p-4 text-sm text-white/70">
            <label className="flex items-center justify-between gap-3"><span>Ghost mode</span><input type="checkbox" checked={ghostMode} onChange={(event) => setGhostMode(event.target.checked)} /></label>
            <label className="flex items-center justify-between gap-3"><span>Hide avatar</span><input type="checkbox" checked={onboardingHiddenAvatar} onChange={(event) => setOnboardingHiddenAvatar(event.target.checked)} /></label>
            <label className="flex items-center justify-between gap-3"><span>Private discovery</span><input type="checkbox" checked={onboardingPrivateDiscovery} onChange={(event) => setOnboardingPrivateDiscovery(event.target.checked)} /></label>
            <div className="flex flex-wrap gap-2">
              {(["handle_only", "full"] as ProfileVisibility[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setOnboardingVisibility(mode)} className={`rounded-full border px-3 py-2 text-xs ${onboardingVisibility === mode ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10 text-white" : "border-white/10 text-white/55"}`}>
                  {mode === "handle_only" ? "Handle only" : "Full name"}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => void handleOnboardingSubmit()} className="mt-8 rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019]">
            Finish onboarding
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

      <div className="grid gap-4 xl:grid-cols-[92px_320px_minmax(0,1fr)_360px]">
        <motion.aside layout transition={reduceMotion ? undefined : motionTokens.spring} className="space-y-4">
          <GlassCard className="p-4">
            <SectionLabel>Identity</SectionLabel>
            <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white">{currentUser.hiddenAvatar ? "◌" : currentUser.avatar}</div>
            <p className="mt-3 font-medium text-white">{displayIdentity(currentUser)}</p>
            <p className="text-sm text-white/55">{currentUser.bio}</p>
            <StatusPill tone="mint" className="mt-3">{currentUser.ghostMode ? "Ghost mode" : "Visible profile"}</StatusPill>
            <button type="button" onClick={() => void signOut({ callbackUrl: "/chat" })} className="mt-3 rounded-full border border-white/10 px-3 py-2 text-xs text-white/60">Sign out</button>
          </GlassCard>

          <GlassCard className="p-4">
            <SectionLabel>Spaces</SectionLabel>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={() => setSelectedWorkspaceId("direct")} className={`rounded-2xl border px-3 py-3 text-left ${selectedWorkspaceId === "direct" ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10" : "border-white/8 bg-white/[0.04]"}`}>
                <p className="font-medium text-white">Direct signals</p>
              </button>
              {state.workspaces.map((workspace) => (
                <button key={workspace.id} type="button" onClick={() => setSelectedWorkspaceId(workspace.id)} className={`rounded-2xl border px-3 py-3 text-left ${selectedWorkspaceId === workspace.id ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10" : "border-white/8 bg-white/[0.04]"}`}>
                  <p className="font-medium text-white">{workspace.name}</p>
                  <p className="text-sm text-white/55">{workspace.ambientScene}</p>
                </button>
              ))}
            </div>
          </GlassCard>
        </motion.aside>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Signal inbox</SectionLabel>
            <StatusPill>{connectionLabel}</StatusPill>
          </div>
          <div className="mt-4 grid gap-2 rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
            <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="New room title" className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
            <input value={roomSubtitle} onChange={(event) => setRoomSubtitle(event.target.value)} placeholder="Room subtitle" className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
            <input value={roomHandles} onChange={(event) => setRoomHandles(event.target.value)} placeholder="Invite handles, comma separated" className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
            <button type="button" onClick={() => void handleCreateRoom()} className="rounded-full border border-[#5DE4FF]/30 bg-[#5DE4FF]/10 px-3 py-2 text-sm text-white">Create room</button>
          </div>
          <div className="mt-3 grid gap-2 rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Join code" className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
            <button type="button" onClick={() => void handleJoinRoom()} className="rounded-full border border-white/10 px-3 py-2 text-sm text-white/70">Join by code</button>
          </div>
          <div className="mt-4 space-y-3">
            {visibleConversations.length ? visibleConversations.map((conversation) => (
              <motion.button key={conversation.id} type="button" layout transition={reduceMotion ? undefined : motionTokens.spring} onClick={() => setSelectedConversationId(conversation.id)} className={`w-full rounded-[24px] border px-4 py-4 text-left ${conversation.id === selectedConversation?.id ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10" : "border-white/8 bg-white/[0.04]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{conversation.title}</p>
                    <p className="text-sm text-white/55">{conversation.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {conversation.unreadCount ? <span className="rounded-full bg-[#FF7A6E] px-2 py-1 text-[11px] font-semibold text-[#071019]">{conversation.unreadCount}</span> : null}
                    <StatusPill tone={conversation.visibility === "e2ee" ? "mint" : conversation.kind === "creator_channel" ? "coral" : "cyan"}>{toneLabel(conversation)}</StatusPill>
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/55">{conversation.lastMessagePreview}</p>
              </motion.button>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/55">No rooms yet. Create one or join with a code.</div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/8 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionLabel>Conversation</SectionLabel>
                <h2 className="mt-2 text-2xl font-semibold text-white">{selectedConversation?.title}</h2>
                <p className="text-sm text-white/55">{selectedConversation?.subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedConversation?.joinCode ? <StatusPill tone="cyan">Join code {selectedConversation.joinCode}</StatusPill> : null}
                <StatusPill tone="mint">{selectedConversation?.visibility === "e2ee" ? "E2EE sealed" : "Shared room"}</StatusPill>
                <StatusPill tone="coral">{queueCount} queued</StatusPill>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search this conversation" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none" />
              <button type="button" onClick={() => void handleWorkspaceAI()} className="rounded-2xl border border-[#5DE4FF]/30 bg-[#5DE4FF]/10 px-4 py-3 text-sm text-white">Refresh AI dock</button>
            </div>
            {pinnedMessages.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {pinnedMessages.slice(0, 3).map((message) => (
                  <button key={message.id} type="button" onClick={() => setMessageSearch(message.preview)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70">
                    Pinned: {message.preview.slice(0, 48)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-3 px-5 py-5">
            <AnimatePresence initial={false}>
              {filteredMessages.length ? filteredMessages.map((message) => {
                const mine = message.senderId === currentUser.id;
                const author = displayIdentity(
                  state.users.find((user) => user.id === message.senderId),
                );
                const replySource = resolvedMessages.find((candidate) => candidate.id === message.replyToId || candidate.clientId === message.replyToId);
                const isPinned = pinnedMessages.some((pinned) => pinned.id === message.id);
                return (
                  <motion.div key={message.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={reduceMotion ? undefined : motionTokens.spring} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-[24px] px-4 py-3 ${mine ? "bg-[linear-gradient(135deg,rgba(93,228,255,0.22),rgba(255,122,110,0.18))] text-white" : "border border-white/8 bg-white/[0.05] text-white/92"}`}>
                      <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.18em] text-white/45"><span>{mine ? "You" : author}</span><span>{formatClock(message.createdAt)}</span></div>
                      {replySource ? <div className="mt-3 rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/55">Reply: {replySource.preview}</div> : null}
                      <p className="mt-2 text-[0.98rem] leading-7">{message.preview}</p>
                      {message.attachments.length ? <div className="mt-3 grid gap-2">{message.attachments.map((attachment) => <div key={attachment.id} className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/70"><span className="font-medium text-[#B9F6FF]">{attachment.mimeType.startsWith("audio/") ? "Voice note" : attachment.mimeType.startsWith("image/") ? "Image" : "Attachment"}</span><p className="mt-1">{attachment.name}</p></div>)}</div> : null}
                      {message.reactions.length ? <div className="mt-3 flex flex-wrap gap-2">{Object.entries(message.reactions.reduce<Record<string, number>>((accumulator, reaction) => { accumulator[reaction.emoji] = (accumulator[reaction.emoji] ?? 0) + 1; return accumulator; }, {})).map(([emoji, count]) => <span key={emoji} className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/70">{emoji} {count}</span>)}</div> : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/45">
                        {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => void handleReaction(message.id, emoji)} className="rounded-full border border-white/10 px-2 py-1">{emoji}</button>)}
                        <button type="button" onClick={() => setReplyToMessageId(message.id)} className="rounded-full border border-white/10 px-2 py-1">Reply</button>
                        <button type="button" onClick={() => void handlePin(message.id, !isPinned)} className="rounded-full border border-white/10 px-2 py-1">{isPinned ? "Unpin" : "Pin"}</button>
                        {mine || canModerate ? (
                          <>
                            {mine ? <button type="button" onClick={() => { setEditingMessageId(message.id); setDraft(message.preview); }} className="rounded-full border border-white/10 px-2 py-1">Edit</button> : null}
                            <button type="button" onClick={() => void handleDeleteMessage(message.id)} className="rounded-full border border-white/10 px-2 py-1">Delete</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => void handleReport(message.id)} className="rounded-full border border-white/10 px-2 py-1">Report</button>
                            <button type="button" onClick={() => void handleBlock(message.senderId)} className="rounded-full border border-white/10 px-2 py-1">Block</button>
                          </>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-white/45">{message.deletedAt ? "Deleted" : message.editedAt ? "Edited" : message.status === "queued" ? "Queued for replay" : selectedConversation?.visibility === "e2ee" ? "Local vault render" : "Managed visible"}</p>
                    </div>
                  </motion.div>
                );
              }) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/55">{messageSearch ? "No messages matched that search." : "This room is quiet. Send the first signal."}</div>
              )}
            </AnimatePresence>
          </div>
          <div className="border-t border-white/8 px-5 py-4">
            {typingUsers.length ? (
              <div className="mb-3 rounded-[18px] border border-[#5DE4FF]/20 bg-[#5DE4FF]/8 px-3 py-2 text-sm text-[#D8FBFF]">
                {typingUsers.map((user) => displayIdentity(user)).join(", ")} typing...
              </div>
            ) : null}
            {replyTarget || editingMessageId ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
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
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60"
                >
                  Clear
                </button>
              </div>
            ) : null}
            {pendingAttachments.length ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70"
                  >
                    {attachment.mimeType.startsWith("audio/") ? "Voice" : attachment.mimeType.startsWith("image/") ? "Image" : "File"}:{" "}
                    {attachment.name}
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              placeholder={
                selectedConversation
                  ? "Write a signal, search memory, or leave a reply..."
                  : "Pick a room to start chatting."
              }
              disabled={!selectedConversation}
              className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-white/35"
            />
            {composerError ? (
              <div className="mt-3 rounded-[18px] border border-[#FF7A6E]/25 bg-[#FF7A6E]/10 px-3 py-2 text-sm text-[#FFD1CB]">
                {composerError}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-full border border-white/10 px-3 py-2 text-xs text-white/70">
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
                  className={`rounded-full border px-3 py-2 text-xs ${
                    recordingVoice
                      ? "border-[#FF7A6E]/40 bg-[#FF7A6E]/12 text-[#FFD1CB]"
                      : "border-white/10 text-white/70"
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
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/70"
                >
                  Ghost rewrite
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!selectedConversation}
                className="rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-5 py-3 text-sm font-medium text-[#071019] disabled:cursor-not-allowed disabled:opacity-40"
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

        <div className="space-y-4">
          <GlassCard className="p-4">
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
                          <p className="text-xs text-white/50">{user.privateDiscovery ? "Exact-handle discovery" : user.bio}</p>
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
          </GlassCard>

          <GlassCard className="p-4">
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
          </GlassCard>

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
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Relationship memory</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{relationshipMemory}</p>
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
              </div>
            </div>
          </GlassCard>

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
                          {device.id === currentDevice?.id ? "Current device" : "Session device"} ·{" "}
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
                      · {formatClock(report.createdAt)}
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
        </div>
      </div>
    </>
  );
}
