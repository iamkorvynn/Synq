import { describe, expect, it } from "vitest";

import { createDemoState } from "@synq/protocol";

import {
  buildRelationshipMemory,
  rewriteWithGhostMode,
  summarizeConversation,
} from "./local-ai";

describe("local ai helpers", () => {
  const state = createDemoState();
  const messages = state.messages.filter(
    (message) => message.conversationId === "conv_dm_arya",
  );

  it("summarizes the latest message run locally", () => {
    expect(
      summarizeConversation(messages, state.users, state.currentUserId),
    ).toContain("Local brief");
  });

  it("creates relationship memory text", () => {
    expect(
      buildRelationshipMemory(messages, state.users, state.currentUserId),
    ).toContain("Latest cue");
  });

  it("rewrites text in ghost mode", () => {
    expect(rewriteWithGhostMode("I need this live!")).toContain("we need");
  });
});
