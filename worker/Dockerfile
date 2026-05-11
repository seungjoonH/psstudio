FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY fe/package.json fe/package.json
COPY be/package.json be/package.json
COPY worker/package.json worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter worker test

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app /app
CMD ["pnpm", "--filter", "worker", "exec", "node", "src/main.js"]
