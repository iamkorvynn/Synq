# Synq

> A premium, highly secure team messenger with end-to-end encryption, spatial UI, and offline-first architecture.

Synq is a production-ready messenger prototype built as a full-stack monorepo with TypeScript. It emphasizes encryption, device trust, and seamless offline message replay.

## ✨ Key Features

- **🔐 End-to-End Encryption** – Client-side sealing with sender-key group helpers and ratcheted session management
- **📱 PWA-First Design** – Cinematic motion, spatial UI, offline message replay, and device trust flows
- **⚡ Real-Time Events** – WebSocket-backed message delivery with trusted session handling
- **🔒 Device Approval** – Multi-device support with explicit device trust policies
- **📎 Secure Attachments** – Client-side encryption with durable blob storage and authentication
- **🚀 Zero Downtime** – Postgres-backed state with built-in schema migrations

## 🏗️ Architecture

This is a monorepo organized as follows:

| Package | Purpose |
|---------|---------|
| **`apps/web`** | Next.js PWA with cinematic motion, spatial UI, device trust flows, and offline replay |
| **`apps/api`** | Fastify control plane with WebSocket events, device approvals, and attachment signing |
| **`packages/protocol`** | Shared enums, schemas, contracts, bootstrap state, and auth/device policies |
| **`packages/crypto`** | Identity bundles, signed prekeys, session ratcheting, group helpers, DM sealing |
| **`packages/ui`** | Glassmorphism primitives, motion tokens, and theme utilities |

**Language Composition:** TypeScript (97.5%) | CSS (1.1%) | JavaScript (1.1%) | Docker (0.3%)

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the web app (fastest path)
npm run dev
# Open http://localhost:3000
```

### Full Stack (Legacy)

```bash
# Run both web and API simultaneously
npm run dev:full
# Web: http://localhost:3000
# API: http://localhost:4000
```

### Production Stack with Docker

```bash
# Start Postgres + API with encrypted blob storage
docker compose up --build
```

## 🌐 Deployment

### Lean Deployment (Recommended for Startups)

Deploy for free on Vercel + Neon Postgres:

```bash
# 1. Deploy web app to Vercel (free tier)
# 2. Use Google OAuth via Auth.js
# 3. Connect free Neon Postgres database
# 4. Keep app invite-only for your team

# See setup guides:
# - docs/vercel-student-deploy.md
# - .env.vercel.example
```

### Self-Hosted Deployment

Deploy on your own infrastructure with Caddy reverse proxy:

```bash
# Copy production config
cp .env.production.example .env.production

# Validate & deploy
npm run deploy:check
npm run deploy:prod:config
npm run deploy:prod:up
```

**Features:**
- HTTPS via Caddy on a single domain
- Private Postgres (no external exposure)
- Automatic schema migrations
- Container health checks for startup ordering
- Encrypted blob storage for attachments

See `docs/deployment-stack.md` for full details.

## 📋 API Endpoints

The Fastify API exposes:

- `GET /ready` – Deployment readiness checks
- `POST /attachments/:attachmentId/upload` – Encrypted attachment upload
- `GET /attachments/:attachmentId/content` – Authenticated encrypted download

## 🧪 Testing

```bash
npm run test
```

## 🔧 Configuration

### Data Store Driver

- **Default (Development):** In-memory store
- **Production:** Postgres backend via `SYNQ_STORE_DRIVER=postgres`

See `.env.vercel.example` and `.env.production.example` for all options.

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **`docs/threat-model.md`** | Security gaps and hardening roadmap |
| **`docs/deployment-stack.md`** | Production deployment guide |
| **`docs/vercel-student-deploy.md`** | Vercel + Neon quick start |
| **`apps/api/schema/synq.sql`** | Full Postgres schema |

## 🔒 Security Notes

- **Local Storage:** Plaintext kept client-side in a vault for private conversations
- **Server Storage:** Only redacted previews of sealed messages are stored/redelivered
- **Attachment Pipeline:** Client-side encryption → durable upload → authenticated download
- **Device Trust:** Explicit approval flows for new devices and sessions

See `docs/threat-model.md` for a complete security assessment.

## 📦 Tech Stack

- **Frontend:** Next.js, TypeScript, React, Framer Motion
- **Backend:** Fastify, WebSockets, Postgres
- **Crypto:** libsodium, sender-key ratcheting
- **Deployment:** Vercel, Docker, Caddy, Neon Postgres
- **Auth:** Auth.js + Google OAuth

## 📄 License

Check the repository for license information.

---

**Made with ❤️ by [@iamkorvynn](https://github.com/iamkorvynn)**
