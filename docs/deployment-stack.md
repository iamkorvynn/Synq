# Synq Deployment Stack

Synq now ships with a production-oriented self-hosted stack built around:

- `web`: Next.js app served behind Caddy
- `api`: Fastify API with Postgres-backed runtime state
- `postgres`: durable primary data store
- `caddy`: TLS termination and reverse proxy

## Public topology

- `https://<your-domain>/` -> Synq web app
- `https://<your-domain>/api/*` -> Synq API
- `https://<your-domain>/realtime*` -> Synq websocket endpoint

Only Caddy exposes public ports. Postgres and the application containers stay on the private Docker network.

## Deployment files

- `docker-compose.production.yml`
- `deploy/Caddyfile`
- `.env.production.example`

## First deploy

1. Copy `.env.production.example` to `.env.production`
2. Fill in your real domain, TLS email, and a strong Postgres password
3. Point your DNS `A` or `AAAA` record at the target server
4. Run `npm run deploy:check`
5. Run `npm run deploy:prod:config`
6. Run `npm run deploy:prod:up`

## Operations notes

- The `migrate` service applies `apps/api/schema/synq.sql` before the API starts.
- Caddy automatically provisions and renews TLS certificates for `SYNQ_DOMAIN`.
- Web container health is checked at `/healthz`.
- API readiness is checked at `/ready`.
- Persistent data lives in Docker volumes:
  - `synq_pgdata`
  - `synq_storage`
  - `caddy_data`
  - `caddy_config`

## Current scope

This production stack matches the repo's current deployable slice:

- durable Postgres runtime state
- encrypted attachment blobs on mounted disk storage
- single public HTTPS entrypoint

It does not yet add Redis fan-out, object-store-backed blobs, managed secrets, backups, or multi-region scaling. Those are the next infrastructure milestones after first production hosting is stable.
