FROM node:20-bullseye-slim AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy the rest of the app and build
COPY . .

ENV NODE_ENV=production
RUN pnpm build

FROM node:20-bullseye-slim

WORKDIR /app

COPY --from=base /app/.output /app
COPY README.md /app

ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379

EXPOSE 3000

USER node

CMD ["/usr/local/bin/node", "/app/server/index.mjs"]
