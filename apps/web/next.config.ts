import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const createNextConfig = (phase: string): NextConfig => ({
  // Keep dev and production build artifacts isolated so a local `next build`
  // cannot corrupt a running `next dev` session.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  output: "standalone",
  transpilePackages: ["@synq/crypto", "@synq/protocol", "@synq/ui"],
});

export default createNextConfig;
