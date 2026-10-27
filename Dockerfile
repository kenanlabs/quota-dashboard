FROM node:24-bookworm-slim AS builder

RUN apt-get update -qq && \
    apt-get install -y -qq python3 make g++ gcc > /dev/null && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tailwind.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build:css && \
    mkdir -p public/vendor && \
    cp node_modules/alpinejs/dist/cdn.min.js public/vendor/alpine.min.js

FROM node:24-bookworm-slim AS production-deps

RUN apt-get update -qq && \
    apt-get install -y -qq python3 make g++ gcc > /dev/null && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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
