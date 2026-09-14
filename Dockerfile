FROM oven/bun:1.4.2 AS base

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the app and build
COPY . .

ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1.4.2

WORKDIR /app

COPY --from=base /app/.output /app
COPY migrations/ /app/migrations
COPY README.md /app

ENV NODE_ENV=production
ENV STORAGE_PATH=/config

RUN mkdir -p /config

EXPOSE 3000

CMD ["bun", "/app/server/index.mjs"]
