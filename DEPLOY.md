# Deployment Guide - Render

## Quick Deploy to Render

### Prerequisites
- GitHub account
- Render account (free tier works)
- Your code pushed to a GitHub repository

### Step 1: Prepare Your Repository

1. Commit all changes:
```bash
git add .
git commit -m "Add Render deployment configuration"
git push origin main
```

### Step 2: Deploy to Render

#### Option A: Blueprint Deployment (Recommended)
1. Click the Deploy to Render button:
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

2. Connect your GitHub repository
3. Render will automatically detect the `render.yaml` file
4. Click "Apply" to create the service

#### Option B: Manual Deployment
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `nostr-stream-bridge`
   - **Runtime**: Docker
   - **Plan**: Free
   - **Docker Path**: `./Dockerfile.render`
5. Add environment variables:
   ```
   PORT=10000
   NODE_ENV=production
   NOSTR_RELAYS=wss://relay.damus.io,wss://relay.snort.social,wss://relay.primal.net
   DEFAULT_THUMB=https://placehold.co/1200x630?text=Nostr+Live
   RETURN_NSEC=false
   LIGHTNING_DOMAIN=npub.cash
   ```

### Step 3: Configure After Deployment

1. Once deployed, get your Render URL:
   - It will be something like: `https://nostr-stream-bridge-xxx.onrender.com`

2. Update the HLS_BASE environment variable:
   - Go to your service's Environment tab
   - Add/Update:
     ```
     HLS_BASE=https://nostr-stream-bridge-xxx.onrender.com/api/hls
     ```
   - Save and let the service redeploy

### Step 4: Test Your Deployment

1. Visit your Render URL: `https://nostr-stream-bridge-xxx.onrender.com`
2. Enter a YouTube/Twitch stream URL
3. Click "Start Mirror"
4. Your stream should now be:
   - Publishing to Nostr relays
   - Viewable on zap.stream
   - Accepting Lightning zaps

## Important Notes

### Free Tier Limitations
- Render free tier spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Limited to 750 hours/month
- Consider upgrading for production use

### Production Considerations

1. **Upgrade to Paid Tier** ($7/month):
   - No spin-downs
   - Better performance
   - Custom domains

2. **Add Custom Domain**:
   - Dashboard → Settings → Custom Domains
   - Add your domain and configure DNS

3. **Environment Variables for Production**:
   ```
   RETURN_NSEC=false  # NEVER set to true in production
   HLS_BASE=https://yourdomain.com/api/hls
   ```

4. **Monitoring**:
   - Set up health checks in Render dashboard
   - Monitor logs for streaming issues

## Troubleshooting

### Stream Not Working?
1. Check Render logs for errors
2. Verify HLS_BASE is set correctly
3. Ensure ffmpeg and yt-dlp installed correctly (check build logs)

### Can't See Stream on zap.stream?
1. Verify the stream is actually running (check logs)
2. Make sure HLS_BASE uses HTTPS and is publicly accessible
3. Check that Nostr events are publishing (look for "Published to relays" in logs)

### Performance Issues?
1. Upgrade to paid tier
2. Consider using a CDN for HLS delivery
3. Use a dedicated VPS for better control

## Alternative Deployment Options

### Railway
```bash
railway login
railway up
```

### VPS Deployment (DigitalOcean/Hetzner)
1. Create a $5-10/month VPS
2. Install Docker
3. Clone repository
4. Run:
   ```bash
   docker build -f Dockerfile.render -t nostr-bridge .
   docker run -p 80:10000 -p 1935:1935 --env-file .env.production nostr-bridge
   ```

### Fly.io
```bash
fly launch
fly secrets set HLS_BASE=https://yourapp.fly.dev/api/hls
fly deploy
```

## Support

- GitHub Issues: [Report bugs](https://github.com/yourusername/nostr-stream-bridge/issues)
- Nostr: Find us on Nostr protocol
- Lightning: Send zaps to support development