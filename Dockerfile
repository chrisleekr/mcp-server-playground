# syntax=docker/dockerfile:1
# hadolint global ignore=DL3018

FROM node:25.5.0-alpine AS base

# Stage 1: Build stage
FROM base AS development

WORKDIR /app

# Disable husky
ENV HUSKY=0

COPY package*.json ./

RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

RUN npm run build

FROM base AS deps

WORKDIR /app

# Disable husky in production deps
ENV HUSKY=0

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Production stage
FROM base AS production

# Disable npm update notifications to prevent stdout pollution
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NO_UPDATE_NOTIFIER=true

ARG PACKAGE_VERSION=untagged
ARG GIT_HASH=unspecified
ARG NODE_ENV=production

LABEL maintainer="Chris Lee"
LABEL com.chrisleekr.mcp-server.package-version=${PACKAGE_VERSION}
LABEL com.chrisleekr.mcp-server.node-env=${NODE_ENV}
LABEL com.chrisleekr.mcp-server.git-hash=${GIT_HASH}

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=development --chown=node:node /app/dist ./dist
COPY --from=development --chown=node:node /app/package*.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "start", "--silent"]
