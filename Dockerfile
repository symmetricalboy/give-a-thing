FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next/standalone ./.next/standalone
COPY --from=builder /app/.next/static ./.next/standalone/.next/static
COPY --from=builder /app/public ./.next/standalone/public
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/lexicons ./lexicons
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["node", "scripts/start-prod.mjs"]
