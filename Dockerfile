# syntax=docker/dockerfile:1
# hadolint global ignore=DL3018

FROM oven/bun:1.3.8-alpine AS base

# Stage 1: Build stage
FROM base AS development

WORKDIR /app

# Disable husky
ENV HUSKY=0

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

# Copy source code
COPY . .

RUN bun run build

FROM base AS deps

WORKDIR /app

# Disable husky in production deps
ENV HUSKY=0

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: Production stage
FROM base AS production

ARG PACKAGE_VERSION=untagged
ARG GIT_HASH=unspecified
ARG NODE_ENV=production

LABEL maintainer="Chris Lee"
LABEL com.chrisleekr.mcp-server.package-version=${PACKAGE_VERSION}
LABEL com.chrisleekr.mcp-server.node-env=${NODE_ENV}
LABEL com.chrisleekr.mcp-server.git-hash=${GIT_HASH}

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=development --chown=bun:bun /app/dist ./dist
COPY --from=development --chown=bun:bun /app/package.json ./
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

CMD ["bun", "run", "dist/index.js"]
