# Frontrow — Home Assistant app image.
#
# The Supervisor builds this on the Pi itself, so the build has to be fast on
# aarch64. It is: better-sqlite3 v13 ships a prebuilt linuxmusl-arm64 binary, so
# nothing is compiled and no toolchain is installed. Alpine keeps the runtime
# under 100 MB.
#
# There is no build.yaml — the Supervisor deprecated it, and the base image is
# named here instead.

# ---------------------------------------------------------------- stage 1
FROM node:24-alpine AS builder
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund

# better-sqlite3 ships prebuilt binaries for eight platforms; Alpine needs two
# of them. The glob matters: they are flat `linuxmusl-arm64.node` files in v13,
# and were directories in older versions — this matches either shape.
RUN find backend/node_modules/better-sqlite3/prebuilds -mindepth 1 -maxdepth 1 \
      -not -name 'linuxmusl-arm64*' -not -name 'linuxmusl-x64*' -exec rm -rf {} + \
 && ls backend/node_modules/better-sqlite3/prebuilds

# ---------------------------------------------------------------- stage 2
FROM node:24-alpine

RUN apk add --no-cache jq tzdata

ENV NODE_ENV=production \
    TZ=Europe/Amsterdam \
    PORT=8199 \
    DB_PATH=/data/frontrow.db \
    # The Supervisor's bridge network has IPv6 enabled, and Node's verbatim DNS
    # ordering tries AAAA first — on a home connection without IPv6 egress that
    # turns every provider fetch into a timeout.
    NODE_OPTIONS=--dns-result-order=ipv4first

WORKDIR /app
COPY --from=builder /build/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=builder /build/frontend/dist ./public

COPY run.sh /run.sh
RUN chmod +x /run.sh

# Feeds the Supervisor's watchdog as well as `docker ps`.
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 8199
CMD ["/run.sh"]
