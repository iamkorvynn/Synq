export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[40px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-12">
          <p className="text-xs uppercase tracking-[0.4em] text-[#5DE4FF]">
            Synq secure release
          </p>
          <h1 className="mt-6 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-white sm:text-7xl">
            A premium messenger for teams that treat privacy like infrastructure.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
            Synq pairs end-to-end sealed chat, verified device trust,
            and a cinematic control room for highly secure teams.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href="/chat"
              className="rounded-full bg-[linear-gradient(135deg,#5DE4FF,#FF7A6E)] px-6 py-3 font-semibold text-[#071019] transition hover:brightness-110"
            >
              Enter the vault
            </a>
            <span className="rounded-full border border-white/12 px-6 py-3 text-white/70">
              Invite-only onboarding
            </span>
            <span className="rounded-full border border-white/12 px-6 py-3 text-white/70">
              Web + PWA launch
            </span>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              "Verified devices and workspace trust controls",
              "Encrypted attachments with strict upload-finalize discipline",
              "Spatial motion design built for calm high-stakes coordination",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[28px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/70"
              >
                {item}
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
                Trust layer
              </p>
              <p className="mt-2 text-sm leading-6 text-white/68">
                The cinematic 3D orb is reserved for the authenticated team workspace so
                the public landing page stays fast, stable, and intentionally lightweight.
              </p>
            </div>
          </div>
          <div className="rounded-[36px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-white/45">
              Why it wins
            </p>
            <div className="mt-4 space-y-4 text-white/70">
              <p>
                Chat-first architecture with secure team rooms,
                private groups, announcement channels, and offline replay.
              </p>
              <p>
                The visual system uses depth, motion, and subtle 3D only where it
                reinforces trust, focus, and operator calm.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
