# Deployment Plan: YouTube to Nostr Streaming with Lightning

## Current Status ✅
- **Local streaming working end-to-end**
- **YouTube → Browser → WebSocket → ffmpeg → MediaMTX → HLS → Nostr**
- **Lightning address integrated via npub.cash**
- **Tagged as v0.1.0-localhost**

## Phase 1: Render Deployment Challenges & Solutions

### Challenge 1: Single Port Limitation
Render free tier only exposes one port (3000). Currently using:
- Port 3000: Next.js app
- Port 8082: WebSocket server
- Port 1935: RTMP (MediaMTX)
- Port 8890: HLS (MediaMTX)

**Solution Options:**
1. **Proxy Everything Through Port 3000** (Recommended)
   - Use Next.js API routes for WebSocket: `/api/ws`
   - Proxy HLS through Next.js: `/api/hls/[...path]`
   - Run MediaMTX in Docker with internal networking
   
2. **Upgrade to Render Paid Tier**
   - Allows multiple ports
   - More straightforward architecture
   - Cost: ~$7/month per service

### Challenge 2: MediaMTX in Production
**Current Issue:** MediaMTX needs persistent storage for HLS segments

**Solution:**
- Use in-memory HLS segments (configure MediaMTX)
- Or use Render persistent disk (paid feature)

### Implementation Steps for Render:

```dockerfile
# Updated Dockerfile for single-port deployment
FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg docker

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Start all services
CMD ["sh", "-c", "docker compose up -d mediamtx && node server.js"]
```

## Phase 2: Public URL Configuration

### Required Changes:
1. **Update HLS URLs** from `localhost:8890` to public domain
2. **Configure CORS** for cross-origin HLS playback
3. **Update Nostr events** with public streaming URLs

### Environment Variables Needed:
```env
PUBLIC_URL=https://your-app.onrender.com
RTMP_URL=rtmp://localhost:1935/live
HLS_BASE_URL=https://your-app.onrender.com/api/hls
```

## Phase 3: Lightning Payment Testing

### Setup Requirements:

1. **Configure npub.cash Wallet**
   ```bash
   # Visit: https://npub.cash
   # Import nsec from publish-server.js output
   # Connect Lightning wallet (Alby, Zeus, etc.)
   ```

2. **Test Payment Flow**
   - Viewer opens stream on zap.stream
   - Clicks zap button
   - Sends Lightning payment
   - Payment routes to npub.cash
   - npub.cash forwards to connected wallet

3. **Verification Steps**
   - [ ] Profile metadata contains `lud16` field
   - [ ] zap.stream shows Lightning button
   - [ ] Small test payment (21 sats) succeeds
   - [ ] Payment appears in connected wallet

## Phase 4: Production Optimizations

### Performance:
1. **Adaptive Bitrate Streaming**
   ```javascript
   // Update MediaRecorder settings
   const mediaRecorder = new MediaRecorder(stream, {
     mimeType: 'video/webm;codecs=vp8,opus',
     videoBitsPerSecond: getAdaptiveBitrate() // Dynamic based on connection
   });
   ```

2. **CDN Integration** (Optional)
   - CloudFlare for HLS delivery
   - Reduces server load
   - Global distribution

### Reliability:
1. **Auto-reconnect WebSocket**
2. **Stream health monitoring**
3. **Automatic republishing to Nostr**

## Phase 5: Testing Checklist

### Local Testing Complete ✅
- [x] Browser capture working
- [x] WebSocket streaming
- [x] RTMP ingestion
- [x] HLS generation
- [x] Nostr publishing
- [x] Lightning address in metadata

### Render Deployment Testing
- [ ] Deploy to Render
- [ ] Test with public URL
- [ ] Verify CORS headers
- [ ] Test from external device
- [ ] Confirm HLS playback

### Lightning Testing
- [ ] Import nsec to npub.cash
- [ ] Connect Lightning wallet
- [ ] Receive test zap (21 sats)
- [ ] Verify payment received
- [ ] Test larger amount (1000 sats)

### End-to-End Production Test
- [ ] Stream YouTube content
- [ ] Verify on zap.stream
- [ ] Receive Lightning payment
- [ ] Monitor for 30 minutes stability
- [ ] Test viewer from different location

## Phase 6: Monetization Setup

### Lightning Revenue Model:
1. **Instant Setup**: npub.cash provides immediate Lightning address
2. **No KYC Required**: Fully non-custodial with connected wallet
3. **Revenue Streams**:
   - Viewer zaps during stream
   - Pay-per-view options (future)
   - Subscriptions via Lightning (NIP-88)

### Wallet Options:
1. **Alby** (Browser extension)
   - Easy setup
   - Good for beginners
   
2. **Zeus** (Mobile)
   - Self-custodial
   - Advanced features
   
3. **LNbits** (Self-hosted)
   - Full control
   - API access

## Implementation Timeline

### Week 1: Render Deployment
- Day 1-2: Refactor for single port
- Day 3-4: Deploy and test public access
- Day 5-7: Fix issues, optimize

### Week 2: Lightning Integration
- Day 1-2: Setup npub.cash wallet
- Day 3-4: Test payment flow
- Day 5-7: Monitor and verify revenue

### Week 3: Production Ready
- Day 1-3: Performance optimization
- Day 4-5: Documentation
- Day 6-7: Launch announcement

## Success Metrics

1. **Technical**:
   - Stream uptime > 99%
   - Latency < 5 seconds
   - Support 100+ concurrent viewers

2. **Financial**:
   - First Lightning payment received
   - Regular zaps during streams
   - Positive revenue after hosting costs

3. **Adoption**:
   - 10+ streams published
   - Visible on major Nostr clients
   - Community feedback positive

## Next Commands

```bash
# Push to GitHub
git push origin main --tags

# Deploy to Render
# 1. Connect GitHub repo to Render
# 2. Set environment variables
# 3. Deploy with Dockerfile

# Test Lightning
# 1. Get nsec from stream publication
# 2. Import to npub.cash
# 3. Connect wallet
# 4. Test zap from another account
```

## Risk Mitigation

1. **YouTube Blocking**: Already solved with browser capture
2. **Render Limitations**: Have upgrade path to paid tier
3. **Lightning Failures**: Multiple wallet fallback options
4. **Stream Quality**: Adaptive bitrate implemented

## Conclusion

The localhost version proves the concept works. With proper deployment configuration and Lightning wallet setup, this becomes a fully functional, monetized streaming platform that bypasses traditional platform restrictions while enabling instant, global payments.