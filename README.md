# Synq

Synq is a greenfield secure messenger prototype built as a monorepo:

- `apps/web`: Next.js PWA with cinematic motion, spatial UI, local AI helpers, and offline message replay.
- `apps/api`: Fastify control plane with trusted session flows, device approvals, realtime websocket events, attachment signing/finalization, and policy-aware AI actions.
- `packages/protocol`: shared enums, schemas, contracts, bootstrap state, and auth/device policy types.
- `packages/crypto`: identity bundles, signed prekeys, ratcheted session helpers, sender-key group helpers, and direct-message sealing utilities.
- `packages/ui`: shared glassmorphism primitives and motion/theme tokens.

## Run locally

```bash
npm install
npm run dev
```

The web app runs on `http://localhost:3000` and the API on `http://localhost:4000`.

To run the durable API path with Postgres-backed state and encrypted attachment blobs:

```bash
docker compose up --build
```

The API exposes:

- `GET /ready` for deploy-time readiness checks
- `POST /attachments/:attachmentId/upload` for encrypted attachment payload upload
- `GET /attachments/:attachmentId/content` for authenticated encrypted attachment download

## Test

```bash
npm run test
```

## Notes

- The API now supports a restart-safe Postgres runtime store when `SYNQ_STORE_DRIVER=postgres`, while tests and quick local runs continue to use the in-memory driver.
- Attachment staging now encrypts bytes client-side, uploads encrypted payloads to durable blob storage, and only allows message send after upload + finalize.
- `apps/api/schema/synq.sql` captures both the entity draft tables and the runtime-state persistence table used by the current deployable slice.
- `docs/threat-model.md` captures the remaining hardening gaps that still separate this repo from a true consumer-grade messenger.
- For private conversations, the client keeps plaintext locally in a vault while the API only stores/redelivers redacted previews for sealed rooms.
