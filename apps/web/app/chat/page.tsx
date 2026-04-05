import { Suspense } from "react";

import { ChatErrorBoundary } from "@/components/chat-error-boundary";
import { ChatExperience } from "@/components/chat-experience";

export default function ChatPage() {
  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/45">
              Synq console
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-white">
              Sovereign communication for small worlds
            </h1>
          </div>
          <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60">
            DMs, private groups, workspaces, creator channels
          </div>
        </div>

        <ChatErrorBoundary>
          <Suspense
            fallback={
              <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-white/70 backdrop-blur-2xl">
                Loading Synq...
              </div>
            }
          >
            <ChatExperience />
          </Suspense>
        </ChatErrorBoundary>
      </div>
    </main>
  );
}
