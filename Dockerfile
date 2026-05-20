# syntax=docker/dockerfile:1.7

# =============================================================================
# Care Diagnostics Billing ERP — multi-stage Dockerfile
#
# Targets:
#   * api      — Node 20 runtime running the bundled Express API server
#   * web      — nginx serving all three SPA frontends + reverse-proxying /api
#   * migrate  — one-off image that runs `drizzle-kit push` against $DATABASE_URL
#
# May 2026 URL layout (single-port unified serve):
#   /                         — clinic-site (public website)
#   /erp/                     — diagnostic-erp (staff portal)
#   /super-admin-portal/      — super-admin-portal
#   /api/                     — Express REST API
#
# Build a single target with:
#   docker build --target api -t care-diagnostics-api .
#   docker build --target web -t care-diagnostics-web .
#
# Or — recommended — use docker compose which builds and wires everything:
#   docker compose up -d --build
# =============================================================================


# -----------------------------------------------------------------------------
# Stage: base
# Installs pnpm + every workspace dependency (deps and devDeps).
# Used as the starting point for both the api and web build stages.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo

# Copy the full repo (the .dockerignore strips node_modules / dist / .git etc.)
COPY . .

# --ignore-scripts skips the preinstall guard (we *are* using pnpm) and any
# package postinstalls that need native compilers we don't ship in the image.
RUN pnpm install --frozen-lockfile --ignore-scripts


# -----------------------------------------------------------------------------
# Stage: api-build
# Bundles the api-server with esbuild and uses `pnpm deploy` to produce a
# self-contained prod-only node_modules tree.
# -----------------------------------------------------------------------------
FROM base AS api-build
RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/api-server --prod --legacy --ignore-scripts deploy /api-deploy


# -----------------------------------------------------------------------------
# Stage: api
# Slim runtime image that only contains the bundled server + prod node_modules.
# SERVE_STATIC_DIR is set by docker-compose to serve the three SPAs.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS api
RUN apk add --no-cache libc6-compat tini
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV LOG_LEVEL=info

COPY --from=api-build /api-deploy/node_modules                    ./node_modules
COPY --from=api-build /repo/artifacts/api-server/dist             ./dist
COPY --from=api-build /repo/artifacts/api-server/package.json     ./package.json

EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]


# -----------------------------------------------------------------------------
# Stage: web-build
# Builds all three Vite frontends with the correct BASE_PATH baked in so they
# can be served side-by-side under the same nginx host.
# -----------------------------------------------------------------------------
FROM base AS web-build
# 1. Public clinic website (root domain — /)
RUN BASE_PATH=/ \
    pnpm --filter @workspace/clinic-site run build
# 2. Staff ERP (moved to /erp/ for May 2026 swap)
RUN BASE_PATH=/erp/ \
    pnpm --filter @workspace/diagnostic-erp run build
# 3. Super Admin Portal
RUN BASE_PATH=/super-admin-portal/ \
    pnpm --filter @workspace/super-admin-portal run build


# -----------------------------------------------------------------------------
# Stage: web
# Static nginx image that serves all three SPAs and forwards /api/* to api svc.
# -----------------------------------------------------------------------------
FROM nginx:alpine AS web
COPY --from=web-build /repo/artifacts/clinic-site/dist/public              /usr/share/nginx/html/site
COPY --from=web-build /repo/artifacts/diagnostic-erp/dist/public           /usr/share/nginx/html/erp
COPY --from=web-build /repo/artifacts/super-admin-portal/dist/public       /usr/share/nginx/html/super-admin-portal
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80


# -----------------------------------------------------------------------------
# Stage: migrate
# One-off helper: runs `pnpm db:push` against $DATABASE_URL.
# Use it via docker compose:  docker compose run --rm migrate
# -----------------------------------------------------------------------------
FROM base AS migrate
WORKDIR /repo
CMD ["pnpm", "--filter", "@workspace/db", "run", "push"]
