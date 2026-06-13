# Kathreftestr — single self-contained image: Next app + MediaMTX + ffmpeg + yt-dlp.
# server.js supervises MediaMTX, so there's no supervisord/entrypoint dance —
# one process tree, `node server.js`. node:20-slim (Debian/glibc) so the
# standalone yt-dlp and MediaMTX binaries run without musl gymnastics.

# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    MEDIAMTX_BIN=/usr/local/bin/mediamtx \
    MEDIAMTX_CONFIG=/etc/mediamtx.yml

ARG MEDIAMTX_VERSION=v1.19.1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && ARCH="$(dpkg --print-architecture)" \
 && case "$ARCH" in amd64) M=amd64; YTD=yt-dlp_linux ;; arm64) M=arm64; YTD=yt-dlp_linux_aarch64 ;; *) M="$ARCH"; YTD=yt-dlp_linux ;; esac \
 && curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTD}" \
 && chmod +x /usr/local/bin/yt-dlp \
 && curl -fsSL -o /tmp/mediamtx.tar.gz "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${M}.tar.gz" \
 && tar -xzf /tmp/mediamtx.tar.gz -C /usr/local/bin mediamtx \
 && rm /tmp/mediamtx.tar.gz \
 && chmod +x /usr/local/bin/mediamtx

COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package*.json next.config.js server.js ./
COPY mediamtx.yml /etc/mediamtx.yml

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
