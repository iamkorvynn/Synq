import type { MessageEnvelope, User } from "@synq/protocol";

export function summarizeConversation(
  messages: MessageEnvelope[],
  users: User[],
  currentUserId: string,
) {
  const latest = messages.slice(-5);
  if (!latest.length) {
    return "No recent messages to summarize.";
  }

  const beats = latest.map((message) => {
    const author =
      message.senderId === currentUserId
        ? "You"
        : users.find((user) => user.id === message.senderId)?.name ?? "Unknown";
    return `${author}: ${message.preview}`;
  });

  return `Local brief: ${beats.join(" | ")}`;
}

export function buildRelationshipMemory(
  messages: MessageEnvelope[],
  users: User[],
  currentUserId: string,
) {
  const otherAuthors = users.filter((user) =>
    messages.some(
      (message) =>
        message.senderId === user.id && message.senderId !== currentUserId,
    ),
  );

  if (!otherAuthors.length) {
    return "No shared memory traces yet.";
  }

  const partner = otherAuthors[0];
  const recentSignal = messages.at(-1)?.preview ?? "No signal";

  return `${partner.name} is consistently focused on ${partner.bio.toLowerCase()} Latest cue: ${recentSignal}`;
}

export function rewriteWithGhostMode(input: string) {
  if (!input.trim()) {
    return "Write a thought first and Synq will shape it.";
  }

  return input
    .replaceAll(/\bI\b/g, "we")
    .replaceAll("!", ".")
    .concat(" Keep the signal tight, private, and cinematic.");
}
