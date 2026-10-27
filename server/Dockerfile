FROM node:22-alpine AS build

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY package.json pnpm-lock.yaml .npmrc tsconfig.json drizzle.config.ts ./
RUN pnpm install --frozen-lockfile
COPY src ./src
COPY migrations ./migrations
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-alpine AS runtime
ARG APP_REVISION=unknown
LABEL org.opencontainers.image.revision=$APP_REVISION org.opencontainers.image.title="IMSOP backend"
ENV APP_REVISION=$APP_REVISION


WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health" || exit 1

USER node

CMD ["node", "dist/index.js"]
