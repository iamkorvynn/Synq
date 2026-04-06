# Synq - Comprehensive Documentation

## Overview

Synq is a modern, secure messenger prototype designed for highly secure teams. It acts as a messaging platform prioritizing privacy, device trust, end-to-end encryption (E2EE), and a highly premium "spatial" cinematic user interface.

## Core Features

1. **End-to-End Encrypted (E2EE) Messaging:** Private conversations are heavily protected using advanced cryptographic ratcheting algorithms. The server only sees redacted previews, and the plaintext stays local to the client in a secure vault.
2. **Device Trust & Authentication:** Security is tied to device approvals. It supports strict device trust states (pending, approved, revoked, compromised) instead of solely relying on traditional passwords. It integrates cleanly with Google OAuth for easy onboarding while maintaining strict cryptographic device identities.
3. **Cinematic Spatial UI:** Built with React Three Fiber, Synq features 3D interactive elements (like the Trust Orb), glassmorphism textures, dynamic gradients, and fluid motion, establishing a state-of-the-art "premium" look and feel.
4. **Ghost Mode & Privacy Controls:** Users can adopt "Ghost" handles, decouple phone numbers, and control profile visibility (full vs. handle-only) to remain low-profile.
5. **Encrypted Attachments:** Media and file sharing follow a strict "encrypt-before-upload" lifecycle, preventing server hosts from accessing shared media contents.
6. **Offline Support & PWA ready:** The Next.js frontend is built as a Progressive Web App (PWA) with offline offline queueing and message replay capabilities.

## Monorepo Architecture

Synq is built as a TypeScript monorepo, structured into independent apps and packages.

### 1. `apps/web` (The Frontend Application)
- **Framework:** Next.js (App Router, PWA-enabled).
- **Styling:** Tailwind CSS integrated with customized design tokens.
- **3D Engine:** React Three Fiber (`@react-three/fiber` & `@react-three/drei`) powering the immersive 3D background effects and the authentication "Orb".
- **Authentication:** NextAuth (Auth.js) combined with custom backend session negotiation, providing Google OAuth sign-in.
- **Client Networking:** Custom HTTP client mapped strictly to backend service architectures, bridging the UI state with realtime websockets.

### 2. `apps/api` (The Backend Control Plane)
- **Framework:** Fastify for high-performance HTTP routing.
- **Realtime:** `@fastify/websocket` for streaming events (message sent, typing indicators, presence).
- **Database:** PostgreSQL (with `pg` driver) for persistent runtime state (storing encypted blobs, relations, audit logs).

### 3. `packages/crypto` (Cryptographic Engine)
- **Library:** `tweetnacl` (NaCl/libsodium typescript port).
- **Functionality:** 
  - Double-ratchet implementations for direct 1:1 messaging.
  - Sender-key orchestration for secure group communications.
  - Prekey bundling for asynchronous session establishment.
  - Symmetric key generation for zero-knowledge attachment uploads.

### 4. `packages/protocol` (Shared Contracts)
- **Library:** Zod (for runtime validation and TypeScript type inference).
- **Functionality:** Contains the absolute source-of-truth for all data structures communicated between the Web app and API. Includes schemas for `Users`, `Conversations`, `Messages`, `AuditEvents`, `Sessions`, and Realtime payloads.

### 5. `packages/ui` (Design System)
- **Functionality:** Shared design tokens (colors, soft/sharp shadows, aurora gradients) and base shared components (like `GlassCard` and `StatusPill`). Ensures visual consistency across potential future apps.

## Database Schema & State

While the actual messages in E2EE rooms are encrypted, the platform must manage relationship state. The Postgres database (or local memory driver) tracks:
- **Workspaces & Circles:** Organizational containers grouping users.
- **Conversations & Channels:** Chat threads, keeping track of members and unread counts.
- **Device Approvals:** Cryptographic public keys linked to user devices with their current authorization status.
- **Message Envelopes:** Stores the encrypted `ciphertext`, sender IDs, status (queued, sent, read), and a `preview` string.
- **Attachments:** Tracks upload lifecycles across `pending`, `uploaded`, and `committed` states.

## Threat Model & Security Considerations

Synq was designed against a stringent threat model:
- **Mitigated Threats:** 
  - Account takeover via server breach (since actual clients hold the private device keys).
  - Server-side metadata leakage (through encrypted references and redacted previews).
- **Current Hardening Features:**
  - Short-lived access sessions + Refresh tokens.
  - Explicit Device authorization workflows.
  - Audit trails for passkey/device/attachment events.
- **Future Roadmap Gaps:** 
  - Full WebAuthn assertion verification.
  - Formal Key Transparency servers.

## Deployment Strategies

The monorepo design allows Synq to be deployed in two drastically different configurations based on requirements:

### Student / Hobbyist Tier (Vercel + Neon)
Ideal for small, friends-only deployments.
- **Stack:** Only `apps/web` deployed to Vercel free tier.
- **Database:** Free Serverless Postgres (Neon).
- **Auth:** NextAuth providing Google login, restricted safely by an email allowlist (`SYNQ_INVITE_EMAILS`).
- **Nature:** Skips the standalone API tier; Next.js server actions handle polling & syncing.

### Self-Hosted Production Tier (Docker Compose)
Ideal for complete control.
- **Stack:** Full infrastructure via `docker-compose.production.yml`.
- **Containers:** 
  - `web` (Next.js server)
  - `api` (Fastify persistent API)
  - `postgres` (Durable database engine)
  - `caddy` (Reverse proxy for automatic HTTPS/TLS termination)
- **Networking:** Caddy routes `/api/*` and `/realtime*` to the Fastify container while resolving the root path to the Next.js container. Postgres remains completely isolated on a private docker network.
