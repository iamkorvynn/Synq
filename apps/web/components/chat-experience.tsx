"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { bytesToBase64String, encryptAttachmentBytes } from "@synq/crypto";
import type { Attachment, Conversation, MessageEnvelope, RealtimeEnvelope, SynqBootstrapState } from "@synq/protocol";
import { GlassCard, SectionLabel, StatusPill, motionTokens } from "@synq/ui";

import {
  completeOnboarding,
  connectRealtime,
  fetchBootstrap,
  finalizeAttachment,
  runAIAction,
  sendMessage,
  signAttachment,
  uploadAttachmentContent,
} from "@/lib/api";
import { getConversationVault, putVaultMessage, rekeyVaultMessage } from "@/lib/message-vault";
import { buildRelationshipMemory, rewriteWithGhostMode, summarizeConversation } from "@/lib/local-ai";
import { enqueueMessage, flushQueuedMessages, getQueuedMessages } from "@/lib/offline-queue";
import { sealPreviewForRecipient } from "@/lib/session-crypto";

import { TrustOrb } from "./trust-orb";

type AuthStage = "loading" | "signed_out" | "ready";

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function toneLabel(conversation: Conversation) {
  if (conversation.visibility === "e2ee") return "sealed";
  if (conversation.kind === "creator_channel") return "broadcast";
  return "managed";
}

function describeAuthError(code: string | null) {
  if (!code) return "";
  if (code === "AccessDenied") {
    return "This Google account is not on the Synq invite list yet.";
  }
  if (code === "Configuration") {
    return "Google auth is not configured yet. Add the Vercel env vars and try again.";
  }
  return "Synq could not complete sign-in with Google.";
}

export function ChatExperience() {
  const { status, data: session } = useSession();
  const searchParams = useSearchParams();
  const authErrorCode = searchParams.get("error");
  const [authStage, setAuthStage] = useState<AuthStage>("loading");
  const [state, setState] = useState<SynqBootstrapState | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("direct");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [draft, setDraft] = useState("");
  const [vault, setVault] = useState<Record<string, string>>({});
  const [queueCount, setQueueCount] = useState(0);
  const [connectionLabel, setConnectionLabel] = useState("google-oauth");
  const [cloudResult, setCloudResult] = useState("");
  const [attachmentState, setAttachmentState] = useState("No attachments staged.");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingHandle, setOnboardingHandle] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [ghostMode, setGhostMode] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [systemNote, setSystemNote] = useState("");
  const reduceMotion = useReducedMotion();
  const deferredDraft = useDeferredValue(draft);

  const currentUser = useMemo(() => state?.users.find((user) => user.id === state.currentUserId) ?? null, [state]);
  const currentDevice = useMemo(() => state?.devices.find((device) => device.id === state.currentDeviceId) ?? null, [state]);

  const visibleConversations = useMemo(() => {
    if (!state) return [];
    return state.conversations.filter((conversation) =>
      selectedWorkspaceId === "direct" ? !conversation.workspaceId : conversation.workspaceId === selectedWorkspaceId,
    );
  }, [selectedWorkspaceId, state]);

  const selectedConversation = useMemo(
    () => visibleConversations.find((conversation) => conversation.id === selectedConversationId) ?? visibleConversations[0],
    [selectedConversationId, visibleConversations],
  );

  const conversationMessages = useMemo(
    () => state?.messages.filter((message) => message.conversationId === selectedConversation?.id) ?? [],
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
                (message.senderId === currentUser?.id ? "Encrypted on this trusted device." : "Sealed history requires an approved device.")
              : message.preview,
        };
      }),
    [conversationMessages, currentUser?.id, selectedConversation?.visibility, vault],
  );

  const localSummary = useMemo(
    () => summarizeConversation(resolvedMessages as MessageEnvelope[], state?.users ?? [], state?.currentUserId ?? ""),
    [resolvedMessages, state?.currentUserId, state?.users],
  );

  const relationshipMemory = useMemo(
    () => buildRelationshipMemory(resolvedMessages as MessageEnvelope[], state?.users ?? [], state?.currentUserId ?? ""),
    [resolvedMessages, state?.currentUserId, state?.users],
  );

  const ghostRewrite = useMemo(() => rewriteWithGhostMode(deferredDraft), [deferredDraft]);

  async function loadBootstrap() {
    try {
      const payload = await fetchBootstrap();
      if (!payload) {
        setState(null);
        setAuthStage("signed_out");
        setConnectionLabel("google-oauth");
        return false;
      }

      startTransition(() => {
        setState(payload);
        setSelectedWorkspaceId((current) =>
          current !== "direct" && payload.workspaces.some((workspace) => workspace.id === current)
            ? current
            : payload.conversations.some((item) => !item.workspaceId)
              ? "direct"
              : payload.workspaces[0]?.id ?? "direct",
        );
        setSelectedConversationId((current) =>
          payload.conversations.some((conversation) => conversation.id === current)
            ? current
            : payload.conversations[0]?.id ?? "",
        );
        setConnectionLabel("polling-sync");
        setOnboardingName(payload.users.find((user) => user.id === payload.currentUserId)?.name ?? session?.user?.name ?? "");
        setOnboardingHandle(payload.users.find((user) => user.id === payload.currentUserId)?.handle ?? "");
        setGhostMode(payload.users.find((user) => user.id === payload.currentUserId)?.ghostMode ?? true);
        setRecoveryEmail(session?.user?.email ?? "");
      });
      setAuthError("");
      setComposerError("");
      setSystemNote("");
      setAuthStage("ready");
      return true;
    } catch {
      setState(null);
      setAuthStage("signed_out");
      setConnectionLabel("google-oauth");
      setAuthError("Synq could not load your workspace right now. Try refreshing once.");
      return false;
    }
  }

  function applyAck(message: MessageEnvelope) {
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.some((item) => item.clientId && item.clientId === message.clientId)
          ? current.messages.map((item) =>
              item.clientId && item.clientId === message.clientId
                ? { ...item, id: message.id, status: message.status }
                : item,
            )
          : [...current.messages, message],
        conversations: current.conversations.map((conversation) =>
          conversation.id === message.conversationId
            ? {
                ...conversation,
                lastActivityAt: message.createdAt,
                lastMessagePreview: conversation.visibility === "e2ee" ? "Encrypted message" : message.preview,
              }
            : conversation,
        ),
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
      setConnectionLabel(event.payload.pendingApproval ? "pending-trust" : "realtime-live");
      return;
    }

    if (event.type === "message.ack") {
      applyAck(event.payload.message as MessageEnvelope);
    }
  }

  useEffect(() => {
    getQueuedMessages().then((queue) => setQueueCount(queue.length));
  }, []);

  useEffect(() => {
    if (status === "loading") {
      setAuthStage("loading");
      return;
    }

    if (status === "unauthenticated") {
      setState(null);
      setAuthStage("signed_out");
      setConnectionLabel("google-oauth");
      setAuthError(describeAuthError(authErrorCode));
      return;
    }

    setAuthStage("loading");
    void loadBootstrap();
  }, [authErrorCode, status, session?.user?.email]);

  useEffect(() => {
    if (!selectedConversation) return;
    void getConversationVault(selectedConversation.id).then((nextVault) => setVault(nextVault));
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!state || authStage !== "ready") return;

    const socket = connectRealtime(handleRealtime, () => {
      setConnectionLabel("polling-sync");
    });

    const onOnline = () => {
      setConnectionLabel("reconnected");
      void flushQueuedMessages(async (message) => {
        const ack = await sendMessage(message);
        applyAck(ack);
      })
        .then((result) => setQueueCount(result.remaining))
        .then(() => loadBootstrap());
    };

    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        void loadBootstrap();
      }
    }, 5000);

    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      socket.close();
    };
  }, [authStage, state?.currentUserId]);

  async function handleGoogleSignIn() {
    setAuthError("");
    await signIn("google", { callbackUrl: "/chat" });
  }

  async function handleOnboardingSubmit() {
    if (!onboardingName.trim() || !onboardingHandle.trim()) {
      setAuthError("Name and handle are required before the vault can open.");
      return;
    }

    try {
      await completeOnboarding({
        name: onboardingName.trim(),
        handle: onboardingHandle.trim(),
        ghostMode,
        recoveryMethods: [
          ...(recoveryEmail.trim() ? [{ kind: "email" as const, value: recoveryEmail.trim() }] : []),
          ...(recoveryPhone.trim() ? [{ kind: "phone" as const, value: recoveryPhone.trim() }] : []),
        ],
      });
      await loadBootstrap();
      setSystemNote("Identity completed. Your private workspace is ready.");
      setAuthError("");
    } catch {
      setAuthError("Synq could not save your onboarding details. Check the handle format and try again.");
    }
  }

  async function handleStageAttachment(file: File) {
    setComposerError("");
    try {
      setAttachmentState(`Signing ${file.name}...`);
      const signed = await signAttachment({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size || 1,
      });
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const encryptedBody = encryptAttachmentBytes(
        fileBytes,
        signed.secret,
        signed.nonce,
      );
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
      setAttachmentState(`${file.name} encrypted, uploaded, and staged.`);
      setSystemNote(`${file.name} is ready to send.`);
    } catch {
      setAttachmentState("Attachment staging failed.");
      setComposerError("Synq could not encrypt and stage that file.");
    }
  }

  async function handleSend() {
    if (!selectedConversation || !currentUser || !state) return;

    const trimmedDraft = draft.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if (!trimmedDraft && !hasAttachments) {
      setComposerError("Write a message or stage an attachment before sending.");
      return;
    }

    setIsSending(true);
    setComposerError("");
    const recipientId = selectedConversation.participantIds.find((id) => id !== currentUser.id) ?? currentUser.id;
    const recipientKey =
      state.devices.find((device) => device.userId === recipientId)?.publicKey ??
      state.devices.find((device) => device.userId === currentUser.id)?.publicKey;

    if (!recipientKey) {
      setIsSending(false);
      return;
    }

    const clientId = crypto.randomUUID();
    const optimisticPreview =
      trimmedDraft || `Sent ${pendingAttachments.length} secure attachment${pendingAttachments.length > 1 ? "s" : ""}.`;
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
      attachments: pendingAttachments,
    };

    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: [...current.messages, optimistic],
        conversations: current.conversations.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                lastActivityAt: optimistic.createdAt,
                lastMessagePreview: conversation.visibility === "e2ee" ? "Encrypted message" : optimistic.preview,
              }
            : conversation,
        ),
      };
    });

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
      messageProtection: selectedConversation.messageProtection,
      attachments: pendingAttachments,
    };

    setDraft("");
    setPendingAttachments([]);
    setAttachmentState("No attachments staged.");

    try {
      if (!navigator.onLine) {
        await enqueueMessage(payload);
        setQueueCount((count) => count + 1);
      } else {
        const ack = await sendMessage(payload);
        applyAck(ack);
      }
      setSystemNote("Signal delivered.");
    } catch {
      await enqueueMessage(payload);
      setQueueCount((count) => count + 1);
      setConnectionLabel("queued-offline");
      setSystemNote("Signal queued locally and will replay when the connection returns.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleWorkspaceAI() {
    if (!selectedConversation || !currentUser) return;
    try {
      if (selectedConversation.visibility === "e2ee") {
        setCloudResult(`Local-only insight: ${localSummary}`);
        setSystemNote("Sealed-room AI stayed on this device.");
        return;
      }

      const result = await runAIAction({
        conversationId: selectedConversation.id,
        action: "memory",
        policy: currentUser.aiPolicy,
        input: draft || selectedConversation.lastMessagePreview,
      });
      setCloudResult(result.result);
      setSystemNote("Workspace AI pulse refreshed.");
    } catch {
      setCloudResult("Workspace AI is unavailable right now.");
      setSystemNote("AI refresh failed, but your messages and local vault are safe.");
    }
  }

  if (authStage === "loading") {
    return (
      <GlassCard className="p-8 sm:p-10">
        <SectionLabel>Booting</SectionLabel>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">Restoring your Synq workspace...</h2>
        <p className="mt-4 text-white/60">Synq is checking your Google session, invite access, and shared rooms before opening the workspace.</p>
      </GlassCard>
    );
  }

  if (authStage !== "ready" || !state || !currentUser) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassCard className="p-8 sm:p-10">
          <SectionLabel>Invite-only beta</SectionLabel>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">Sign in with Google to enter the Synq private beta.</h2>
          <p className="mt-4 max-w-2xl text-white/65">
            This version is optimized for the free Vercel tier: one Next.js app, one invite-only Google login, and lightweight shared rooms for you and your friends.
          </p>
          <p className="mt-4 text-sm text-[#B9F6FF]">Only invited Google accounts can enter.</p>
          {authError ? (
            <div className="mt-6 rounded-[24px] border border-[#FF7A6E]/30 bg-[#FF7A6E]/10 px-4 py-3 text-sm text-[#FFD1CB]">
              {authError}
            </div>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleGoogleSignIn()} className="rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019]">
              Continue with Google
            </button>
          </div>
        </GlassCard>
        <GlassCard className="p-6">
          <SectionLabel>Trust surface</SectionLabel>
          <div className="mt-4"><TrustOrb /></div>
        </GlassCard>
      </div>
    );
  }

  if (!currentUser.onboardingComplete) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassCard className="p-8 sm:p-10">
          <SectionLabel>Onboarding</SectionLabel>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">Finish your private identity.</h2>
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
          <label className="mt-6 flex items-center gap-3 text-white/75">
            <input type="checkbox" checked={ghostMode} onChange={(event) => setGhostMode(event.target.checked)} />
            Enable ghost mode
          </label>
          <button type="button" onClick={() => void handleOnboardingSubmit()} className="mt-8 rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019]">
            Finish onboarding
          </button>
        </GlassCard>
        <GlassCard className="p-6">
          <SectionLabel>Trust surface</SectionLabel>
          <div className="mt-4"><TrustOrb /></div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[92px_320px_minmax(0,1fr)_340px]">
      <motion.aside layout transition={reduceMotion ? undefined : motionTokens.spring} className="space-y-4">
        <GlassCard className="p-4">
          <SectionLabel>Identity</SectionLabel>
          <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white">{currentUser.avatar}</div>
          <p className="mt-3 font-medium text-white">{currentUser.name}</p>
          <p className="text-sm text-white/55">@{currentUser.handle}</p>
          <StatusPill tone="mint" className="mt-3">{currentUser.ghostMode ? "Ghost mode" : "Public mode"}</StatusPill>
          <button type="button" onClick={() => void signOut({ callbackUrl: "/chat" })} className="mt-3 rounded-full border border-white/10 px-3 py-2 text-xs text-white/60">
            Sign out
          </button>
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
        <div className="mt-4 space-y-3">
          {visibleConversations.map((conversation) => (
            <motion.button key={conversation.id} type="button" layout transition={reduceMotion ? undefined : motionTokens.spring} onClick={() => setSelectedConversationId(conversation.id)} className={`w-full rounded-[24px] border px-4 py-4 text-left ${conversation.id === selectedConversation?.id ? "border-[#5DE4FF]/40 bg-[#5DE4FF]/10" : "border-white/8 bg-white/[0.04]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{conversation.title}</p>
                  <p className="text-sm text-white/55">{conversation.subtitle}</p>
                </div>
                <StatusPill tone={conversation.visibility === "e2ee" ? "mint" : conversation.kind === "creator_channel" ? "coral" : "cyan"}>{toneLabel(conversation)}</StatusPill>
              </div>
              <p className="mt-3 text-sm text-white/55">{conversation.lastMessagePreview}</p>
            </motion.button>
          ))}
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
              <StatusPill tone="mint">{selectedConversation?.visibility === "e2ee" ? "E2EE sealed" : "Invite-only"}</StatusPill>
              <StatusPill tone="coral">{selectedConversation?.messageProtection ?? "ratcheted"}</StatusPill>
              <StatusPill tone="coral">{queueCount} queued</StatusPill>
            </div>
          </div>
          {systemNote ? (
            <div className="mt-4 rounded-[24px] border border-[#5DE4FF]/20 bg-[#5DE4FF]/10 px-4 py-3 text-sm text-[#D8FBFF]">
              {systemNote}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 px-5 py-5">
          <AnimatePresence initial={false}>
            {resolvedMessages.map((message) => {
              const mine = message.senderId === currentUser.id;
              const author = state.users.find((user) => user.id === message.senderId)?.name ?? "Unknown";

              return (
                <motion.div key={message.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={reduceMotion ? undefined : motionTokens.spring} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-[24px] px-4 py-3 ${mine ? "bg-[linear-gradient(135deg,rgba(93,228,255,0.22),rgba(255,122,110,0.18))] text-white" : "border border-white/8 bg-white/[0.05] text-white/92"}`}>
                    <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.18em] text-white/45">
                      <span>{mine ? "You" : author}</span>
                      <span>{formatClock(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-[0.98rem] leading-7">{message.preview}</p>
                    {message.attachments.length ? <p className="mt-2 text-sm text-[#B9F6FF]">{message.attachments.length} secure attachment{message.attachments.length > 1 ? "s" : ""}</p> : null}
                    <p className="mt-2 text-xs text-white/45">{message.status === "queued" ? "Queued for replay" : selectedConversation?.visibility === "e2ee" ? "Local vault render" : "Managed visible"}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="border-t border-white/8 px-5 py-4">
          <div className="grid gap-3">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Send a private signal..." className="min-h-28 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none placeholder:text-white/30" />
            {composerError ? (
              <div className="rounded-[20px] border border-[#FF7A6E]/30 bg-[#FF7A6E]/10 px-4 py-3 text-sm text-[#FFD1CB]">
                {composerError}
              </div>
            ) : null}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/60">Ghost rewrite: {ghostRewrite}</div>
              <label className="cursor-pointer rounded-[24px] border border-white/10 px-4 py-3 text-sm text-white/70">
                Stage attachment
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
              <button type="button" onClick={() => void handleSend()} disabled={isSending} className="rounded-[24px] bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-medium text-[#071019] transition hover:brightness-110 disabled:opacity-60">
                {isSending ? "Sealing..." : "Seal + send"}
              </button>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
              {attachmentState}
              {pendingAttachments.length ? <span className="ml-2 text-[#B9F6FF]">{pendingAttachments.length} committed attachment{pendingAttachments.length > 1 ? "s" : ""} ready</span> : null}
            </div>
          </div>
        </div>
      </GlassCard>

      <motion.aside layout transition={reduceMotion ? undefined : motionTokens.spring} className="space-y-4">
        <GlassCard className="p-4">
          <SectionLabel>Trust surface</SectionLabel>
          <div className="mt-4"><TrustOrb /></div>
          <p className="mt-3 text-sm text-white/60">Free-tier shared mode with Google auth, one domain, and a tiny invite-only crew.</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <SectionLabel>AI dock</SectionLabel>
            <button type="button" onClick={() => void handleWorkspaceAI()} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/75 transition hover:border-[#5DE4FF]/40">
              Refresh
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-white">Local brief</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{localSummary}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Memory card</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{relationshipMemory}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Workspace AI pulse</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{cloudResult || "No cloud-visible action invoked yet."}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <SectionLabel>Devices</SectionLabel>
          <div className="mt-4 space-y-3">
            {state.devices.filter((device) => device.userId === state.currentUserId).map((device) => (
              <div key={device.id} className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{device.label}</p>
                    <p className="text-sm text-white/55">{device.fingerprint}</p>
                  </div>
                  <StatusPill tone="mint">{device.trustState}</StatusPill>
                </div>
                {currentDevice?.id === device.id ? <p className="mt-3 text-xs text-white/50">Active on {session?.user?.email}</p> : null}
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.aside>
    </div>
  );
}
