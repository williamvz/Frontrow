# Frontrow — Home Assistant add-on image.
#
# The Supervisor builds this on the Pi itself, so the build has to be quick and
# has to work on aarch64. Two stages:
#   1. builder — full toolchain: compiles the React bundle and installs the
#      backend's production dependencies (better-sqlite3 normally lands as a
#      prebuilt binary, but the toolchain is here so a source build also works).
#   2. runtime — slim image with only node_modules, the server and the bundle.

# ---------------------------------------------------------------- stage 1
FROM node:24-bookworm-slim AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# --- frontend bundle
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- backend production dependencies
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------- stage 2
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends jq tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=Europe/Amsterdam \
    PORT=8199 \
    DB_PATH=/data/frontrow.db

WORKDIR /app
COPY --from=builder /build/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=builder /build/frontend/dist ./public

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8199
CMD ["/run.sh"]
