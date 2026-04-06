const featureCards = [
  {
    title: "Create rooms and share a code",
    description:
      "Start a secure room and share the room code with the people who should join.",
  },
  {
    title: "Sealed private chats",
    description:
      "Private conversations render from the local vault so sealed chat stays device-local.",
  },
  {
    title: "Trusted device controls",
    description:
      "See device trust status, rename devices, and revoke sessions you no longer trust.",
  },
  {
    title: "Encrypted files and voice notes",
    description:
      "Encrypt attachments before upload and send voice notes directly from the composer.",
  },
  {
    title: "Direct chats and shared rooms",
    description:
      "Use direct conversations by handle, private groups, workspace rooms, and announcement channels.",
  },
  {
    title: "Offline replay",
    description:
      "Queue messages while offline and replay them automatically when you reconnect.",
  },
] as const;

const workflowSteps = [
  {
    title: "Create a room",
    description:
      "Open a private group, workspace room, or announcement channel from the chat workspace.",
  },
  {
    title: "Share the room code",
    description:
      "Send the generated code to the people who should be allowed into that room.",
  },
  {
    title: "Join from your device",
    description:
      "Members join by code and can see device trust information inside the app.",
  },
  {
    title: "Chat and send encrypted files",
    description:
      "Send messages, voice notes, and encrypted attachments in the same flow.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[40px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-12">
            <p className="text-xs uppercase tracking-[0.4em] text-[#5DE4FF]">
              Secure team messenger
            </p>
            <h1 className="mt-6 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-white sm:text-7xl">
              Create secure rooms, share the code, and chat with your team.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Synq is a secure messenger for teams with room-code entry,
              direct chats by handle, device trust controls, encrypted
              attachments, and offline replay in a focused chat workspace.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href="/chat"
                className="rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-semibold text-[#071019] transition hover:brightness-110"
              >
                Open secure chat
              </a>
              <span className="rounded-full border border-white/12 px-6 py-3 text-white/70">
                Join rooms by code
              </span>
              <span className="rounded-full border border-white/12 px-6 py-3 text-white/70">
                Encrypted attachments
              </span>
              <span className="rounded-full border border-white/12 px-6 py-3 text-white/70">
                Web + PWA
              </span>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {featureCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-[28px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/70"
                >
                  <p className="font-semibold text-white">{card.title}</p>
                  <p className="mt-2 text-white/68">{card.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6">
            <div className="relative h-[300px] w-full overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(93,228,255,0.16),_transparent_45%),radial-gradient(circle_at_70%_25%,_rgba(255,122,110,0.18),_transparent_28%),rgba(255,255,255,0.02)] shadow-[0_30px_120px_rgba(5,10,18,0.45)]">
              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(93,228,255,0.9),_rgba(93,228,255,0.15)_45%,_transparent_70%)] blur-[2px]" />
              <div className="absolute left-[58%] top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,122,110,0.28),_transparent_68%)] blur-xl" />
              <div className="absolute inset-x-6 bottom-6 rounded-[24px] border border-white/10 bg-black/20 px-5 py-4 backdrop-blur-xl">
                <p className="text-[0.68rem] uppercase tracking-[0.35em] text-white/45">
                  How access works
                </p>
                <p className="mt-2 text-sm leading-6 text-white/68">
                  Create a room, share the room code, and let people join from
                  their own devices. Inside Synq you can see device trust status
                  and revoke devices when needed.
                </p>
              </div>
            </div>
            <div className="rounded-[36px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
              <p className="text-xs uppercase tracking-[0.35em] text-white/45">
                What Synq is for
              </p>
              <div className="mt-4 space-y-4 text-white/70">
                <p>
                  Synq is for high-trust teams that want secure daily
                  communication without turning chat into a bulky collaboration
                  suite.
                </p>
                <p>
                  It also works well for student teams, labs, and small private
                  groups that need protected coordination, direct chats by
                  handle, and room-code entry.
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-[40px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.25)] backdrop-blur-2xl sm:p-10">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.35em] text-[#5DE4FF]">
              How Synq works
            </p>
            <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-white sm:text-4xl">
              A simple way to start secure team chat.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/68">
              Synq is built around a simple pattern people can understand fast:
              create a room, share the code, join from a device, and chat or
              send encrypted files.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-[28px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/70"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                  Step {index + 1}
                </p>
                <p className="mt-2 font-semibold text-white">{step.title}</p>
                <p className="mt-2 text-white/68">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/20 px-6 py-5 backdrop-blur-xl sm:px-8">
          <p className="text-sm font-medium text-white">
            Secure rooms, code-based joining, direct chats by handle, device
            controls, encrypted attachments, voice notes, and offline replay
            are already part of the live Synq product.
          </p>
          <p className="mt-2 text-sm leading-6 text-white/62">
            Made for high-trust teams first, and useful for student teams,
            labs, and small private groups that need protected coordination.
          </p>
        </section>
      </div>
    </main>
  );
}
