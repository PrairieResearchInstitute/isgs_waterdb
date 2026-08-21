FROM node:22-alpine AS builder

WORKDIR /app

COPY web/package.json web/package-lock.json* ./web/
WORKDIR /app/web
RUN npm ci

COPY web ./

RUN npm run build

RUN npm prune --production


FROM node:22-alpine AS seeder

WORKDIR /app

COPY web/package.json web/package-lock.json* ./
RUN npm ci && apk add --no-cache postgresql-client

COPY web/ ./
# /data is bind-mounted at runtime via docker-compose
# Create a second database for execlusive use by dagster
CMD ["sh", "-c", "(psql \"$DATABASE_URL\" -c 'CREATE DATABASE dagster' 2>&1 || true) && npm run db:push && npm run db:seed"]


FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/web/build ./build
COPY --from=builder /app/web/node_modules ./node_modules
COPY --from=builder /app/web/package.json ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "build/index.js"]