# =========================================================
# Stage 1: Build Next.js 15 Static Frontend
# =========================================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

# =========================================================
# Stage 2: Build Rust Backend
# =========================================================
FROM rust:1-bookworm AS backend-builder
WORKDIR /app/backend

COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
RUN cargo build --release && cp /app/backend/target/release/kv-tidal /app/kv-tidal

# =========================================================
# Stage 3: Minimal Production Runtime
# =========================================================
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libssl3 \
    python3 \
    && curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /app/kv-tidal /app/kv-tidal
COPY --from=frontend-builder /app/frontend/out /app/web

ENV HOST=0.0.0.0 \
    PORT=8080 \
    PUID=1000 \
    PGID=1000 \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    MUSIC_DIR=/music

RUN mkdir -p /data /music && chmod 777 /data /music && chmod +x /app/kv-tidal

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/rest/ping.view || exit 1

ENTRYPOINT ["/app/kv-tidal"]
