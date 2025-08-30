#!/bin/sh
set -e

# Set environment variables
if [ -n "$RENDER_EXTERNAL_HOSTNAME" ]; then
    export HLS_BASE="https://$RENDER_EXTERNAL_HOSTNAME/api/hls"
    echo "HLS_BASE set to: $HLS_BASE"
fi

# Start MediaMTX in background
echo "Starting MediaMTX..."
/usr/local/bin/mediamtx /etc/mediamtx.yml 2>&1 &
MEDIAMTX_PID=$!

# Give MediaMTX time to start
sleep 3

# Check if MediaMTX is running
if ps -p $MEDIAMTX_PID > /dev/null; then
    echo "MediaMTX started successfully (PID: $MEDIAMTX_PID)"
else
    echo "ERROR: MediaMTX failed to start"
    exit 1
fi

# Start Next.js in foreground
echo "Starting Next.js application..."
exec npm start