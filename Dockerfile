# Production Dockerfile for Next.js app with streaming tools
FROM node:20-slim AS base

# Install dependencies for streaming
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install streaming tools
RUN pip3 install --break-system-packages streamlink yt-dlp

# Install MediaMTX
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        wget https://github.com/bluenviron/mediamtx/releases/download/v1.14.0/mediamtx_v1.14.0_linux_amd64.tar.gz && \
        tar -xzf mediamtx_v1.14.0_linux_amd64.tar.gz; \
    else \
        wget https://github.com/bluenviron/mediamtx/releases/download/v1.14.0/mediamtx_v1.14.0_linux_arm64v8.tar.gz && \
        tar -xzf mediamtx_v1.14.0_linux_arm64v8.tar.gz; \
    fi && \
    chmod +x mediamtx && \
    mv mediamtx /usr/local/bin/ && \
    rm mediamtx_*.tar.gz

# Copy MediaMTX config
COPY mediamtx.yml /etc/mediamtx.yml

# Set working directory
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Build application
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/server.js ./server.js

# Copy public directory if it exists
RUN mkdir -p ./public

# Create a non-root user
RUN addgroup --gid 1001 nodejs && \
    adduser --disabled-password --gecos "" --uid 1001 --ingroup nodejs nodejs

USER nodejs

EXPOSE 3000

CMD ["npm", "start"]