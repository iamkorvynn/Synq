import { describe, expect, it } from "vitest";

import {
  ConversationKindSchema,
  HTTP_CONTRACTS,
  REALTIME_CONTRACTS,
  SynqBootstrapStateSchema,
  createDemoState,
} from "./index";

describe("protocol", () => {
  it("validates the demo bootstrap payload", () => {
    const parsed = SynqBootstrapStateSchema.parse(createDemoState());

    expect(parsed.conversations).toHaveLength(4);
    expect(parsed.users[0]?.ghostMode).toBe(true);
  });

  it("keeps the planned contracts stable", () => {
    expect(ConversationKindSchema.parse("creator_channel")).toBe(
      "creator_channel",
    );
    expect(REALTIME_CONTRACTS).toContain("message.ack");
    expect(HTTP_CONTRACTS).toContain("/auth/passkey/challenge");
  });
});
