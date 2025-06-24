# syntax=docker/dockerfile:1
# hadolint global ignore=DL3018

FROM node:22.16.0-alpine AS base

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

USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "start", "--silent"]
