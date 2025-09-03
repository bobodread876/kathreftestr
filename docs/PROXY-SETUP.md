# Proxy Configuration Guide for Cloud Deployments

## Overview

When deploying Kathreftestr on cloud platforms like Render, DigitalOcean, or AWS, you may encounter IP-based restrictions from YouTube or Twitch that block server-side streaming. This guide shows how to configure proxy support to bypass these restrictions.

## Quick Start

### Option 1: Environment Variables (Easiest)

Set these environment variables in your cloud platform's dashboard:

```bash
# Enable proxy
PROXY_ENABLED=true

# For HTTP proxy
PROXY_TYPE=http
PROXY_HOST=your-proxy-host.com
PROXY_PORT=8080
PROXY_USERNAME=your-username  # Optional
PROXY_PASSWORD=your-password  # Optional

# For SOCKS5 proxy
PROXY_TYPE=socks5
PROXY_HOST=your-socks-host.com
PROXY_PORT=1080

# For Tor
PROXY_TYPE=tor
TOR_PORT=9050  # Default Tor SOCKS port

# Auto-fallback to browser mode if proxy fails
AUTO_FALLBACK=true  # Default: true
FALLBACK_DELAY=5000  # Milliseconds before fallback
```

### Option 2: Configuration File

Create `.proxy-config.json` in the project root:

```json
{
  "enabled": true,
  "type": "socks5",
  "host": "proxy.example.com",
  "port": "1080",
  "username": "",
  "password": "",
  "autoFallback": true,
  "fallbackDelay": 5000
}
```

## Proxy Services

### 1. Free Proxies (Not Recommended for Production)

```bash
# Example using free SOCKS5 proxy
PROXY_TYPE=socks5
PROXY_HOST=public-proxy.com
PROXY_PORT=1080
```

⚠️ **Warning**: Free proxies are unreliable and may be blocked by streaming services.

### 2. Premium Proxy Services

#### Bright Data (formerly Luminati)
```bash
PROXY_TYPE=http
PROXY_HOST=zproxy.lum-superproxy.io
PROXY_PORT=22225
PROXY_USERNAME=customer-username-zone-residential
PROXY_PASSWORD=your-password
```

#### IPRoyal
```bash
PROXY_TYPE=socks5
PROXY_HOST=proxy.iproyal.com
PROXY_PORT=12321
PROXY_USERNAME=username
PROXY_PASSWORD=password
```

#### SmartProxy
```bash
PROXY_TYPE=http
PROXY_HOST=gate.smartproxy.com
PROXY_PORT=10000
PROXY_USERNAME=username
PROXY_PASSWORD=password
```

### 3. Tor Network (Free & Anonymous)

#### Install Tor on your server:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install tor
sudo systemctl start tor
```

**Docker (add to Dockerfile):**
```dockerfile
RUN apk add --no-cache tor
RUN echo "SocksPort 0.0.0.0:9050" >> /etc/tor/torrc
CMD tor & npm start
```

**Configure Kathreftestr:**
```bash
PROXY_TYPE=tor
TOR_PORT=9050
```

### 4. Self-Hosted VPN

#### Using WireGuard:

1. Set up WireGuard on a VPS in a different region:
```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
bash wireguard-install.sh
```

2. Configure your cloud server as a WireGuard client
3. Route streaming traffic through the VPN

## Platform-Specific Setup

### Render

1. Go to your service dashboard
2. Click "Environment" tab
3. Add proxy environment variables
4. Redeploy

### DigitalOcean App Platform

```yaml
# app.yaml
envs:
  - key: PROXY_ENABLED
    value: "true"
  - key: PROXY_TYPE
    value: "socks5"
  - key: PROXY_HOST
    value: "your-proxy.com"
  - key: PROXY_PORT
    value: "1080"
```

### Fly.io

```bash
fly secrets set PROXY_ENABLED=true
fly secrets set PROXY_TYPE=http
fly secrets set PROXY_HOST=proxy.example.com
fly secrets set PROXY_PORT=8080
```

### Docker Compose

```yaml
services:
  kathreftestr:
    environment:
      - PROXY_ENABLED=true
      - PROXY_TYPE=socks5
      - PROXY_HOST=proxy
      - PROXY_PORT=1080
  
  # Optional: Include Tor proxy
  tor-proxy:
    image: dperson/torproxy
    ports:
      - "9050:9050"
```

## Rotating Proxies

For better reliability, use rotating proxies:

```bash
# Comma-separated list of proxies
ROTATE_PROXIES=true
PROXY_LIST="socks5://proxy1.com:1080,http://user:pass@proxy2.com:8080,socks5://proxy3.com:1081"
```

## Testing Proxy Configuration

### 1. Test proxy connectivity:

```bash
# SSH into your server
curl -x socks5://localhost:9050 https://api.ipify.org
```

### 2. Test streaming with proxy:

```bash
# Test yt-dlp with proxy
yt-dlp --proxy socks5://localhost:9050 --simulate https://www.youtube.com/watch?v=jNQXAC9IVRw
```

### 3. Check proxy status in app:

```bash
curl https://your-app.com/api/health
```

## Automatic Fallback

When server extraction fails (even with proxy), the app automatically falls back to headless browser mode:

1. **Detection**: App detects IP blocking or extraction failure
2. **Fallback**: Automatically switches to headless browser method
3. **Notification**: User is notified about the fallback
4. **Streaming**: Stream continues using browser-based extraction

## Troubleshooting

### Error: "Server extraction failed - use browser method"

**Solution 1**: Configure a proxy (see above)

**Solution 2**: Let auto-fallback handle it:
```bash
AUTO_FALLBACK=true  # Automatically use browser mode
```

### Error: "429 Too Many Requests"

**Solution**: Use rotating proxies or add delays:
```bash
ROTATE_PROXIES=true
PROXY_LIST="proxy1,proxy2,proxy3"
```

### Error: Proxy connection failed

**Check proxy status:**
```bash
# Test SOCKS5
curl -x socks5://host:port https://api.ipify.org

# Test HTTP
curl -x http://host:port https://api.ipify.org
```

### Browser fallback not working

**Ensure Chromium is installed:**
```bash
# In Dockerfile
RUN apk add --no-cache chromium
```

## Best Practices

1. **Use Premium Proxies**: Free proxies are often blocked by streaming services
2. **Rotate Proxies**: Distribute requests across multiple proxies
3. **Monitor Health**: Set up monitoring for proxy connectivity
4. **Fallback Strategy**: Always enable AUTO_FALLBACK for reliability
5. **Regional Proxies**: Use proxies in the same region as the content
6. **Authentication**: Use authenticated proxies to avoid IP bans

## Security Considerations

1. **Never commit proxy credentials** to your repository
2. **Use environment variables** for sensitive data
3. **Rotate credentials** regularly
4. **Monitor usage** to detect unauthorized access
5. **Use HTTPS proxies** when available

## Cost Optimization

| Method | Monthly Cost | Reliability | Speed |
|--------|-------------|------------|-------|
| No Proxy | $0 | ❌ Low | ⚡ Fast |
| Tor | $0 | ⚠️ Medium | 🐢 Slow |
| Shared Proxy | $10-50 | ⚠️ Medium | ⚡ Fast |
| Premium Proxy | $50-200 | ✅ High | ⚡ Fast |
| Dedicated VPN | $5-20 | ✅ High | ⚡ Fast |

## Recommended Setup for Production

```bash
# Use premium rotating proxies with auto-fallback
PROXY_ENABLED=true
PROXY_TYPE=http
ROTATE_PROXIES=true
PROXY_LIST="http://user1:pass1@premium1.com:8080,http://user2:pass2@premium2.com:8080"
AUTO_FALLBACK=true
FALLBACK_DELAY=3000

# Add cookies for better success rate
YOUTUBE_COOKIES_FILE=/data/cookies.txt
```

## Support

- Check proxy status: `/api/health`
- View active streams: `/api/streams`
- Test extraction: `/api/test-extraction?url=YOUR_URL`

For more help, see [GitHub Issues](https://github.com/islandbitcoin/kathreftestr/issues)