"use client";

import type { ReactNode } from "react";
import { Component } from "react";

import { GlassCard, SectionLabel } from "@synq/ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: unknown) {
    console.error("Synq chat surface crashed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <GlassCard className="p-8 sm:p-10">
          <SectionLabel>Recovery</SectionLabel>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-white">
            The chat UI hit a browser-side error.
          </h2>
          <p className="mt-4 max-w-2xl text-white/60">
            Synq kept the page alive, but one client component failed to render.
            Refresh once. If it still happens, I can trace the exact component next.
          </p>
        </GlassCard>
      );
    }

    return this.props.children;
  }
}
