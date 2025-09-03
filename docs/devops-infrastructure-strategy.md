# DevOps Infrastructure Strategy

## Goal
Enable one-click deployment of Kathreftestr across any platform (cloud, VPS, self-hosted) with automatic configuration and minimal user intervention.

---

## Current Architecture Analysis

### Services Required:
1. **Next.js Application** (Port 3000)
2. **WebSocket Server** (Port 8082)
3. **MediaMTX RTMP/HLS Server** (Ports 1935, 8888, 8889, 8890)
4. **System Dependencies** (ffmpeg, yt-dlp, streamlink)

### Current Pain Points:
- Multiple services need manual startup
- System dependencies require manual installation
- Port configuration varies by platform
- No health monitoring
- No automatic restart on failure
- State management across restarts

---

## Proposed Solution Architecture

### 1. Unified Container Strategy

```
kathreftestr-all-in-one/
├── Next.js App
├── WebSocket Server
├── MediaMTX
├── FFmpeg + yt-dlp
├── Process Manager (Supervisor)
└── Health Monitor
```

### 2. Multi-Container Strategy (Production)

```
docker-compose services:
├── app (Next.js + WebSocket)
├── mediamtx (RTMP/HLS)
├── redis (State persistence)
└── nginx (Reverse proxy)
```

---

## Implementation Plan

### Phase 1: Create Unified Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    supervisor \
    curl \
    bash

# Install yt-dlp and streamlink
RUN pip3 install --no-cache-dir \
    yt-dlp \
    streamlink

# Install MediaMTX
RUN wget https://github.com/bluenviron/mediamtx/releases/download/v1.0.0/mediamtx_v1.0.0_linux_amd64.tar.gz && \
    tar -xzf mediamtx_v1.0.0_linux_amd64.tar.gz && \
    rm mediamtx_v1.0.0_linux_amd64.tar.gz && \
    chmod +x mediamtx

# Copy application
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Configure supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose all required ports
EXPOSE 3000 8082 1935 8888 8889 8890

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

### Phase 2: Environment Configuration

```yaml
# config.yaml - Auto-generated based on platform
app:
  url: ${APP_URL:-http://localhost:3000}
  ws_url: ${WS_URL:-ws://localhost:8082}

streaming:
  rtmp_url: ${RTMP_URL:-rtmp://localhost:1935}
  hls_url: ${HLS_URL:-http://localhost:8890}

nostr:
  relays:
    - ${NOSTR_RELAY_1:-wss://relay.damus.io}
    - ${NOSTR_RELAY_2:-wss://relay.nostr.band}

storage:
  type: ${STORAGE_TYPE:-local}
  path: ${STORAGE_PATH:-/data}
```

---

## Platform-Specific Deployments

### 1. DigitalOcean App Platform

```yaml
# .do/app.yaml
name: kathreftestr
services:
  - name: web
    image:
      registry_type: DOCKER_HUB
      registry: kathreftestr
      repository: kathreftestr
      tag: latest
    http_port: 3000
    instance_count: 1
    instance_size_slug: basic-xs
    routes:
      - path: /
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}
```

**Deploy Button:**
```markdown
[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/yourusername/kathreftestr/tree/main)
```

### 2. Render

```yaml
# render.yaml
services:
  - type: web
    name: kathreftestr
    env: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .
    envVars:
      - key: NODE_ENV
        value: production
    autoDeploy: true
```

**Deploy Button:**
```markdown
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yourusername/kathreftestr)
```

### 3. Fly.io

```toml
# fly.toml
app = "kathreftestr"
kill_signal = "SIGINT"
kill_timeout = 5

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[[services]]
  internal_port = 3000
  protocol = "tcp"
  auto_stop_machines = true
  auto_start_machines = true

  [[services.ports]]
    port = 80
    handlers = ["http"]
    
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[[services]]
  internal_port = 8082
  protocol = "tcp"
  
  [[services.ports]]
    port = 8082

[[services]]
  internal_port = 1935
  protocol = "tcp"
  
  [[services.ports]]
    port = 1935
```

**Deploy Command:**
```bash
fly launch --image kathreftestr/kathreftestr:latest
```

### 4. Railway

```json
{
  "name": "Kathreftestr",
  "description": "Stream YouTube/Twitch to Nostr",
  "repository": "https://github.com/yourusername/kathreftestr",
  "branch": "main",
  "envVars": {
    "NODE_ENV": "production"
  },
  "services": [
    {
      "name": "app",
      "startCommand": "npm start",
      "healthcheckPath": "/api/health"
    }
  ]
}
```

**Deploy Button:**
```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/yourusername/kathreftestr)
```

### 5. Umbrel App Store

```yaml
# umbrel-app.yml
manifestVersion: 1
id: kathreftestr
name: Kathreftestr
tagline: Stream to Nostr with Bitcoin Lightning
category: Social
version: "1.0.0"
description: >-
  Mirror YouTube and Twitch streams to Nostr with
  Bitcoin Lightning tipping support.
developer: Kathreftestr Team
website: https://kathreftestr.com
dependencies: []
repo: https://github.com/yourusername/kathreftestr
support: https://github.com/yourusername/kathreftestr/issues
port: 3847
torOnly: false
permissions:
  - STORAGE
path: ""
defaultUsername: ""
defaultPassword: ""
containers:
  - name: kathreftestr
    image: kathreftestr/kathreftestr:1.0.0
    port: 3000
    environment:
      NODE_ENV: production
      STORAGE_PATH: /data
    volumes:
      - data:/data
```

### 6. Start9 Package

```yaml
# manifest.yaml
id: kathreftestr
title: "Kathreftestr"
version: 1.0.0
release-notes: "Initial release"
license: MIT
wrapper-repo: "https://github.com/yourusername/kathreftestr-wrapper"
upstream-repo: "https://github.com/yourusername/kathreftestr"
support-site: "https://github.com/yourusername/kathreftestr/issues"
marketing-site: "https://kathreftestr.com"
build: ["docker"]
description:
  short: "Stream to Nostr"
  long: "Mirror YouTube/Twitch to Nostr with Lightning"
assets:
  license: LICENSE
  icon: icon.png
  instructions: instructions.md
main:
  type: docker
  image: kathreftestr
  system: true
  entrypoint: docker-entrypoint.sh
  args: []
  mounts:
    main: /data
health-checks:
  web-ui:
    name: Web UI
    success-message: Kathreftestr is ready
    type: script
config: ~
properties: ~
volumes:
  main:
    type: data
interfaces:
  main:
    name: Web UI
    description: Kathreftestr Web Interface
    tor-config:
      port-mapping:
        80: "3000"
    lan-config:
      443:
        ssl: true
        internal: 3000
    ui: true
    protocols:
      - tcp
      - http
dependencies: {}
backup:
  create:
    type: docker
    image: duplicity
    system: true
    entrypoint: backup-entrypoint.sh
    args: ["create"]
    mounts:
      BACKUP: /mnt/backup
      main: /data
  restore:
    type: docker
    image: duplicity
    system: true
    entrypoint: backup-entrypoint.sh
    args: ["restore"]
    mounts:
      BACKUP: /mnt/backup
      main: /data
```

---

## One-Click Install Script

```bash
#!/bin/bash
# install.sh - Universal installer for Kathreftestr

set -e

echo "🚀 Kathreftestr One-Click Installer"
echo "===================================="

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    if [[ "$OS" == "linux" ]]; then
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker $USER
    else
        echo "Please install Docker Desktop: https://docker.com"
        exit 1
    fi
fi

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Clone repository if needed
if [ ! -d "kathreftestr" ]; then
    echo "📥 Cloning Kathreftestr..."
    git clone https://github.com/yourusername/kathreftestr.git
    cd kathreftestr
else
    cd kathreftestr
    git pull
fi

# Create .env file
if [ ! -f .env ]; then
    echo "⚙️ Creating configuration..."
    cat > .env << EOF
NODE_ENV=production
APP_URL=http://localhost:3000
WS_URL=ws://localhost:8082
RTMP_URL=rtmp://localhost:1935
HLS_URL=http://localhost:8890
EOF
fi

# Build and start
echo "🏗️ Building Kathreftestr..."
docker-compose build

echo "🚀 Starting Kathreftestr..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 10

# Health check
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ Kathreftestr is running!"
    echo ""
    echo "🌐 Web UI: http://localhost:3000"
    echo "📺 RTMP: rtmp://localhost:1935/live"
    echo "📡 HLS: http://localhost:8890"
    echo ""
    echo "📚 Documentation: https://kathreftestr.com/docs"
    echo "💬 Support: https://github.com/yourusername/kathreftestr/issues"
else
    echo "❌ Failed to start. Check logs: docker-compose logs"
    exit 1
fi
```

---

## Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    container_name: kathreftestr-app
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "8082:8082"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - MEDIAMTX_URL=rtmp://mediamtx:1935
    volumes:
      - ./data:/data
      - ./logs:/logs
    depends_on:
      - redis
      - mediamtx
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  mediamtx:
    image: bluenviron/mediamtx:latest
    container_name: kathreftestr-mediamtx
    restart: unless-stopped
    ports:
      - "1935:1935"
      - "8888:8888"
      - "8889:8889"
      - "8890:8554"
    volumes:
      - ./mediamtx.yml:/mediamtx.yml
      - ./recordings:/recordings

  redis:
    image: redis:7-alpine
    container_name: kathreftestr-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    command: redis-server --save 60 1 --loglevel warning

  nginx:
    image: nginx:alpine
    container_name: kathreftestr-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - app

volumes:
  redis_data:
```

---

## Health Monitoring

```javascript
// api/health/route.ts
export async function GET() {
  const checks = {
    app: 'ok',
    mediamtx: 'unknown',
    redis: 'unknown',
    ffmpeg: 'unknown',
    ytdlp: 'unknown'
  };

  try {
    // Check MediaMTX
    const mediamtxResponse = await fetch('http://localhost:8888/v3/config/get');
    checks.mediamtx = mediamtxResponse.ok ? 'ok' : 'error';
  } catch {
    checks.mediamtx = 'error';
  }

  try {
    // Check Redis
    const redis = new Redis(process.env.REDIS_URL);
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  try {
    // Check ffmpeg
    await exec('ffmpeg -version');
    checks.ffmpeg = 'ok';
  } catch {
    checks.ffmpeg = 'error';
  }

  try {
    // Check yt-dlp
    await exec('yt-dlp --version');
    checks.ytdlp = 'ok';
  } catch {
    checks.ytdlp = 'error';
  }

  const allOk = Object.values(checks).every(status => status === 'ok');
  
  return Response.json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  }, { 
    status: allOk ? 200 : 503 
  });
}
```

---

## Auto-Configuration

```javascript
// lib/auto-config.js
const detectEnvironment = () => {
  const env = {
    platform: 'unknown',
    features: {
      ssl: false,
      tor: false,
      publicIp: false
    }
  };

  // Detect Umbrel
  if (process.env.UMBREL_ROOT) {
    env.platform = 'umbrel';
    env.features.tor = true;
  }
  
  // Detect Start9
  if (process.env.START9_ROOT) {
    env.platform = 'start9';
    env.features.tor = true;
  }
  
  // Detect Railway
  if (process.env.RAILWAY_ENVIRONMENT) {
    env.platform = 'railway';
    env.features.ssl = true;
    env.features.publicIp = true;
  }
  
  // Detect Render
  if (process.env.RENDER) {
    env.platform = 'render';
    env.features.ssl = true;
    env.features.publicIp = true;
  }
  
  // Detect Fly.io
  if (process.env.FLY_APP_NAME) {
    env.platform = 'fly';
    env.features.ssl = true;
    env.features.publicIp = true;
  }
  
  return env;
};

const generateConfig = (env) => {
  const config = {
    app: {
      url: process.env.APP_URL || 'http://localhost:3000',
      wsUrl: process.env.WS_URL || 'ws://localhost:8082'
    },
    streaming: {
      rtmpUrl: process.env.RTMP_URL || 'rtmp://localhost:1935',
      hlsUrl: process.env.HLS_URL || 'http://localhost:8890'
    }
  };
  
  // Platform-specific adjustments
  if (env.platform === 'umbrel') {
    config.app.url = `http://${process.env.DEVICE_HOSTNAME}.local:3847`;
  }
  
  if (env.features.ssl) {
    config.app.url = config.app.url.replace('http://', 'https://');
    config.app.wsUrl = config.app.wsUrl.replace('ws://', 'wss://');
  }
  
  return config;
};

export { detectEnvironment, generateConfig };
```

---

## Deployment Checklist

### Pre-Deployment:
- [ ] Docker image built and tested
- [ ] Environment variables documented
- [ ] Health endpoints implemented
- [ ] Logging configured
- [ ] Secrets management setup

### Deployment:
- [ ] Push Docker image to registry
- [ ] Configure platform-specific files
- [ ] Test deployment scripts
- [ ] Verify health checks
- [ ] Test auto-configuration

### Post-Deployment:
- [ ] Monitor logs
- [ ] Check performance metrics
- [ ] Verify all services running
- [ ] Test streaming functionality
- [ ] Document any issues

---

## Maintenance & Updates

### Rolling Updates:
```bash
# Update without downtime
docker-compose pull
docker-compose up -d --no-deps --build app
```

### Backup Strategy:
```bash
# Backup data
docker run --rm -v kathreftestr_data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz /data

# Restore data
docker run --rm -v kathreftestr_data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /
```

### Log Management:
```yaml
# docker-compose.yml addition
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

---

## Security Considerations

1. **Secrets Management**:
   - Use Docker secrets
   - Environment variable encryption
   - Rotate keys regularly

2. **Network Security**:
   - Internal service communication only
   - Rate limiting on public endpoints
   - DDoS protection

3. **Data Protection**:
   - Encrypted volumes
   - Regular backups
   - GDPR compliance

---

## Performance Optimization

1. **Resource Limits**:
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

2. **Caching Strategy**:
   - Redis for session data
   - CDN for static assets
   - Browser caching headers

3. **Scaling**:
   - Horizontal scaling for app instances
   - Load balancing with nginx
   - Database connection pooling

---

## Support Matrix

| Platform | Status | Deploy Method | Maintenance |
|----------|--------|---------------|-------------|
| Docker | ✅ Ready | docker-compose | Easy |
| DigitalOcean | ✅ Ready | App Platform | Automatic |
| Render | ✅ Ready | Blueprint | Automatic |
| Fly.io | ✅ Ready | fly.toml | Easy |
| Railway | 🚧 Testing | Template | Automatic |
| Umbrel | 🚧 Testing | App Store | Easy |
| Start9 | 📋 Planned | Package | Manual |
| Heroku | 📋 Planned | Buildpack | Automatic |
| Vercel | ❌ Not Suitable | - | - |

---

*This infrastructure strategy ensures Kathreftestr can be deployed anywhere with minimal friction.*