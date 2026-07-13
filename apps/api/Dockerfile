# Build context is the monorepo root (see docker-compose.yml)
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @quanta/shared build && pnpm --filter @quanta/api build

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=builder /repo/packages/shared/package.json packages/shared/
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/package.json apps/api/
RUN pnpm install --prod --frozen-lockfile=false
COPY --from=builder /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
EXPOSE 3000
# Apply pending migrations, then boot the API.
CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/main.js"]
