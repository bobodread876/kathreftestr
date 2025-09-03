#!/bin/bash

# Set HLS_BASE dynamically based on Render's URL
if [ -n "$RENDER_EXTERNAL_HOSTNAME" ]; then
    export HLS_BASE="https://$RENDER_EXTERNAL_HOSTNAME/api/hls"
    echo "Setting HLS_BASE to: $HLS_BASE"
else
    export HLS_BASE="http://localhost:8890/live"
    echo "Using default HLS_BASE: $HLS_BASE"
fi

# Start MediaMTX in the background
echo "Starting MediaMTX..."
/usr/local/bin/mediamtx /etc/mediamtx.yml 2>&1 | sed 's/^/[MediaMTX] /' &
MEDIAMTX_PID=$!

# Wait for MediaMTX to be ready
echo "Waiting for MediaMTX to be ready..."
sleep 3

# Check if MediaMTX is running
if ! kill -0 $MEDIAMTX_PID 2>/dev/null; then
    echo "ERROR: MediaMTX failed to start!"
    exit 1
fi

echo "MediaMTX is running with PID $MEDIAMTX_PID"

# Start Next.js
echo "Starting Next.js application..."
exec npm start