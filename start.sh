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
/usr/local/bin/mediamtx /etc/mediamtx.yml &

# Wait for MediaMTX to be ready
sleep 2

# Start Next.js
echo "Starting Next.js application..."
exec npm start