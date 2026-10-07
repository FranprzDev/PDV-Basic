FROM alpine:3.21 AS base
RUN apk add --no-cache nodejs npm nginx && npm i -g bun

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/print-agent/package.json ./apps/print-agent/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/event-sourcing/package.json ./packages/event-sourcing/
COPY packages/ui/package.json ./packages/ui/
RUN bun install --frozen-lockfile --ignore-scripts

FROM base AS build
WORKDIR /app
COPY --from=deps /app .
COPY . .

ENV BETTER_AUTH_SECRET=build-placeholder

# Single base URL — everything derives from it
ARG NEXT_PUBLIC_BASE_URL=http://localhost
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV BASE_URL=$NEXT_PUBLIC_BASE_URL

# El POS se sirve en la raíz, sin basePath.
RUN mkdir -p apps/web/data && cd apps/web && bun run --bun next build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy built web app
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/next.config.mjs ./apps/web/
COPY --from=build /app/apps/web/drizzle.config.ts ./apps/web/
COPY --from=build /app/apps/web/tsconfig.json ./apps/web/
COPY --from=build /app/apps/web/scripts ./apps/web/scripts
COPY --from=build /app/apps/web/src ./apps/web/src

# Copy packages source (needed by drizzle-kit at runtime)
COPY --from=build /app/packages ./packages

# Print agent: runs on the store machine, reaches the printer on the local network
COPY --from=build /app/apps/print-agent ./apps/print-agent

COPY --from=build /app/package.json ./

# Nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3111
CMD ["/docker-entrypoint.sh"]
