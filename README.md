# Synq

Synq is a premium, highly secure team messenger prototype built as a monorepo.

The easiest working path now is:

- deploy `apps/web` on Vercel
- use Google OAuth through Auth.js
- use a free Neon Postgres database
- keep the app invite-only for your team

Repo layout:

- `apps/web`: Next.js PWA with cinematic motion, spatial UI, device trust flows, and offline message replay.
- `apps/api`: Fastify control plane with trusted session flows, device approvals, realtime websocket events, and attachment signing/finalization.
- `packages/protocol`: shared enums, schemas, contracts, bootstrap state, and auth/device policy types.
- `packages/crypto`: identity bundles, signed prekeys, ratcheted session helpers, sender-key group helpers, and direct-message sealing utilities.
- `packages/ui`: shared glassmorphism primitives and motion/theme tokens.

## Run locally

```bash
npm install
npm run dev
```

The simplest local path is now the Vercel-style app at `http://localhost:3000`.

If you still want the old split-stack local dev mode:

```bash
npm run dev:full
```

That runs the web app on `http://localhost:3000` and the legacy API on `http://localhost:4000`.

To run the durable API path with Postgres-backed state and encrypted attachment blobs:

```bash
docker compose up --build
```

The API exposes:

- `GET /ready` for deploy-time readiness checks
- `POST /attachments/:attachmentId/upload` for encrypted attachment payload upload
- `GET /attachments/:attachmentId/content` for authenticated encrypted attachment download

## Lean deployment

For the cheapest working deploy, use:

- Vercel free tier
- Google OAuth
- Neon free Postgres

Read:

- `docs/vercel-student-deploy.md`
- `.env.vercel.example`

## Self-hosted deployment

Synq now includes a production-oriented self-hosted stack:

- `docker-compose.production.yml`
- `deploy/Caddyfile`
- `.env.production.example`
- `docs/deployment-stack.md`

Use it like this:

```bash
cp .env.production.example .env.production
npm run deploy:check
npm run deploy:prod:config
npm run deploy:prod:up
```

That stack serves the web app and API behind one HTTPS domain with Caddy, keeps Postgres private, runs schema migration before the API starts, and uses container health checks for startup ordering.

## Test

```bash
npm run test
```

## Notes

- The API now supports a restart-safe Postgres runtime store when `SYNQ_STORE_DRIVER=postgres`, while tests and quick local runs continue to use the in-memory driver.
- Attachment staging now encrypts bytes client-side, uploads encrypted payloads to durable blob storage, and only allows message send after upload + finalize.
- `apps/api/schema/synq.sql` captures both the entity draft tables and the runtime-state persistence table used by the current deployable slice.
- `docs/threat-model.md` captures the remaining hardening gaps that still separate this repo from a true consumer-grade messenger.
- `docs/deployment-stack.md` documents the production stack that is currently supported by the codebase.
- For private conversations, the client keeps plaintext locally in a vault while the API only stores/redelivers redacted previews for sealed rooms.
