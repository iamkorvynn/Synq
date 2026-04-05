import type { HTMLAttributes, PropsWithChildren } from "react";

import clsx from "clsx";

export function cx(...input: Array<string | false | null | undefined>) {
  return clsx(input);
}

export function GlassCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-[28px] border border-white/10 bg-white/[0.06] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <p
      className={cx(
        "text-[0.68rem] uppercase tracking-[0.35em] text-white/45",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function StatusPill({
  tone = "cyan",
  className,
  children,
}: PropsWithChildren<{ tone?: "cyan" | "coral" | "mint"; className?: string }>) {
  const toneClass =
    tone === "coral"
      ? "border-[#FF7A6E]/30 bg-[#FF7A6E]/10 text-[#FFB7AF]"
      : tone === "mint"
        ? "border-[#98FFD5]/30 bg-[#98FFD5]/10 text-[#C8FFE9]"
        : "border-[#5DE4FF]/30 bg-[#5DE4FF]/10 text-[#B9F6FF]";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}
