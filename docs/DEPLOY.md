# Deployment Guide

## 🚀 Quick Start (One-Click Install)

### Linux/macOS
```bash
curl -sSL https://raw.githubusercontent.com/islandbitcoin/kathreftestr/main/scripts/install.sh | bash
```

Or clone and run locally:
```bash
git clone https://github.com/islandbitcoin/kathreftestr.git
cd kathreftestr
chmod +x scripts/install.sh
./scripts/install.sh
```

---

## 📦 Manual Docker Installation

### Prerequisites
- Docker 20.10+
- Docker Compose v2.0+
- 2GB RAM minimum
- 10GB disk space

### Steps

1. **Clone the repository:**
```bash
git clone https://github.com/islandbitcoin/kathreftestr.git
cd kathreftestr
```

2. **Create environment file:**
```bash
cat > .env << EOF
NODE_ENV=production
APP_URL=http://localhost:3000
WS_URL=ws://localhost:8082
RTMP_URL=rtmp://localhost:1935
HLS_URL=http://localhost:8890
EOF
```

3. **Build and start:**
```bash
docker compose up -d
```

4. **Verify installation:**
```bash
curl http://localhost:3000/api/health
```

---

## ☁️ Cloud Deployments

### Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/islandbitcoin/kathreftestr)

1. Click the button above
2. Connect your GitHub repository
3. Configure environment variables:
   ```
   NODE_ENV=production
   PORT=10000
   ```
4. Deploy (takes ~10 minutes)

### DigitalOcean App Platform
[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/islandbitcoin/kathreftestr/tree/main)

1. Click the button above
2. Configure app settings
3. Set environment variables
4. Deploy

### Fly.io
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly secrets set NODE_ENV=production
fly deploy
```

### Railway
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/islandbitcoin/kathreftestr)

1. Click the button above
2. Configure environment variables
3. Deploy automatically

### Heroku
```bash
# Create app
heroku create your-app-name

# Add buildpacks
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git

# Deploy
git push heroku main
```

---

## 🏠 Self-Hosted Deployments

### VPS Setup (Ubuntu/Debian)

#### Quick Install
```bash
# Run the one-click installer
curl -sSL https://raw.githubusercontent.com/islandbitcoin/kathreftestr/main/scripts/install.sh | bash
```

#### Manual Install
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Clone repository
git clone https://github.com/islandbitcoin/kathreftestr.git
cd kathreftestr

# Start services
docker compose up -d
```

### Umbrel App Store
```bash
# SSH into your Umbrel
ssh umbrel@umbrel.local

# Install Kathreftestr
cd ~/umbrel/app-data
git clone https://github.com/islandbitcoin/kathreftestr.git
cd kathreftestr
docker compose -f docker-compose.umbrel.yml up -d
```

### Start9
Coming soon! Track progress at [#start9-support](https://github.com/islandbitcoin/kathreftestr/issues)

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `production` | Yes |
| `APP_URL` | Application URL | `http://localhost:3000` | Yes |
| `WS_URL` | WebSocket URL | `ws://localhost:8082` | Yes |
| `RTMP_URL` | RTMP server URL | `rtmp://localhost:1935` | Yes |
| `HLS_URL` | HLS streaming URL | `http://localhost:8890` | Yes |
| `REDIS_URL` | Redis connection (optional) | - | No |
| `REDIS_PASSWORD` | Redis password | - | No |

### Port Configuration

| Port | Service | Description | Protocol |
|------|---------|-------------|----------|
| 3000 | Next.js | Web application | HTTP |
| 8082 | WebSocket | Real-time communication | WS |
| 1935 | RTMP | Stream ingestion | RTMP |
| 8890 | HLS | Stream output | HTTP |
| 8888 | MediaMTX API | Stream management | HTTP |
| 8889 | WebRTC | Peer connections | UDP |

---

## 🔒 Production Security

### SSL/HTTPS Setup with Caddy (Easiest)

1. **Install Caddy:**
```bash
# Create Caddyfile
cat > Caddyfile << EOF
yourdomain.com {
    reverse_proxy localhost:3000
}

yourdomain.com:8082 {
    reverse_proxy localhost:8082
}
EOF

# Run Caddy
docker run -d \
  --name caddy \
  --restart unless-stopped \
  -p 80:80 \
  -p 443:443 \
  -v $(pwd)/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  caddy:alpine
```

### SSL with Nginx

1. **Install Certbot:**
```bash
sudo apt install certbot python3-certbot-nginx
```

2. **Configure Nginx:**
```nginx
server {
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /ws {
        proxy_pass http://localhost:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
    
    location /live {
        proxy_pass http://localhost:8890;
        proxy_http_version 1.1;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Get SSL certificate:**
```bash
sudo certbot --nginx -d yourdomain.com
```

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 1935/tcp  # RTMP
sudo ufw allow 8890/tcp  # HLS
sudo ufw enable
```

---

## 📊 Monitoring & Maintenance

### Health Monitoring

```bash
# Check service health
curl http://localhost:3000/api/health

# Monitor with watch
watch -n 5 'curl -s localhost:3000/api/health | jq .'
```

### Log Management

```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f kathreftestr

# Export logs
docker compose logs > kathreftestr-$(date +%Y%m%d).log

# Log rotation (add to docker-compose.yml)
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
```

### Performance Monitoring

```bash
# Container stats
docker stats kathreftestr

# System resources
htop

# Disk usage
df -h
docker system df
```

### Backup & Restore

```bash
# Backup data
tar czf kathreftestr-backup-$(date +%Y%m%d).tar.gz data/ logs/

# Restore data
tar xzf kathreftestr-backup-20240101.tar.gz

# Backup Docker volumes
docker run --rm -v kathreftestr_data:/data -v $(pwd):/backup alpine tar czf /backup/data-backup.tar.gz /data
```

---

## 🔄 Updates & Upgrades

### Docker Update
```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d

# Clean old images
docker image prune -a
```

### Git Update
```bash
# Backup first
cp -r data data.backup

# Update code
git pull origin main

# Rebuild and restart
docker compose down
docker compose up -d --build
```

### Zero-Downtime Update
```bash
# Build new image
docker compose build

# Start new container
docker compose up -d --no-deps --build kathreftestr

# Verify health
curl localhost:3000/api/health

# Remove old container
docker compose rm -f -s kathreftestr.old
```

---

## 🛠️ Troubleshooting

### Common Issues

#### Ports Already in Use
```bash
# Find process using port
sudo lsof -i :3000
sudo kill -9 <PID>

# Or change ports in .env
PORT=3001
```

#### Stream Not Working
```bash
# Check MediaMTX
curl http://localhost:8888/v3/config/get

# Test RTMP
ffmpeg -re -i test.mp4 -c copy -f flv rtmp://localhost:1935/live/test

# Verify HLS
curl http://localhost:8890/live/test/index.m3u8
```

#### High Memory Usage
```bash
# Add to docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

#### Container Crashes
```bash
# Check logs
docker compose logs --tail=100 kathreftestr

# Restart with verbose logging
docker compose down
DEBUG=* docker compose up
```

---

## 🚀 Performance Optimization

### CDN Setup (Cloudflare)
1. Add your domain to Cloudflare
2. Enable proxy for A records
3. Set SSL mode to "Full (strict)"
4. Add page rules for streaming paths

### Redis Caching
```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### System Tuning
```bash
# Increase file limits
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Network optimization
sudo sysctl -w net.core.rmem_max=26214400
sudo sysctl -w net.core.rmem_default=26214400
```

---

## 📋 Production Checklist

- [ ] SSL certificates installed
- [ ] Firewall configured
- [ ] Backup strategy implemented
- [ ] Monitoring setup (Uptime Kuma, etc.)
- [ ] Log rotation configured
- [ ] Resource limits set
- [ ] Auto-restart enabled
- [ ] Security updates scheduled
- [ ] Documentation updated

---

## 🆘 Support

- 📖 [Documentation](https://github.com/islandbitcoin/kathreftestr/wiki)
- 🐛 [Issues](https://github.com/islandbitcoin/kathreftestr/issues)
- 💬 [Discussions](https://github.com/islandbitcoin/kathreftestr/discussions)
- 📧 Email: support@kathreftestr.com

---

*Last updated: September 2025*