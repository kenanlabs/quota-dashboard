# 国内加速源，默认启用；官方源构建：
#   --build-arg DEBIAN_MIRROR=deb.debian.org --build-arg NPM_REGISTRY=https://registry.npmjs.org
ARG DEBIAN_MIRROR=mirrors.aliyun.com
ARG NPM_REGISTRY=https://registry.npmmirror.com

FROM node:24-bookworm-slim AS builder
ARG DEBIAN_MIRROR
ARG NPM_REGISTRY
ENV npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3

RUN sed -i "s@deb.debian.org@${DEBIAN_MIRROR}@g" /etc/apt/sources.list.d/debian.sources && \
    apt-get update -qq && \
    apt-get install -y -qq python3 make g++ gcc > /dev/null && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY"
COPY tailwind.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build:css && \
    mkdir -p public/vendor && \
    cp node_modules/alpinejs/dist/cdn.min.js public/vendor/alpine.min.js

FROM node:24-bookworm-slim AS production-deps
ARG DEBIAN_MIRROR
ARG NPM_REGISTRY
ENV npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3

RUN sed -i "s@deb.debian.org@${DEBIAN_MIRROR}@g" /etc/apt/sources.list.d/debian.sources && \
    apt-get update -qq && \
    apt-get install -y -qq python3 make g++ gcc > /dev/null && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry="$NPM_REGISTRY"

FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json ./
COPY config.js server.js ./
COPY db/schema.js ./db/schema.js
COPY routes/ ./routes/
COPY providers/ ./providers/
COPY middleware/ ./middleware/
COPY services/ ./services/
COPY --from=builder /app/public ./public

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
