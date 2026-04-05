FROM node:22-alpine AS builder

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build --workspace @synq/api
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/apps/api/schema ./apps/api/schema
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/crypto ./packages/crypto
COPY --from=builder /app/packages/protocol ./packages/protocol

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "dist/index.js"]
