#!/bin/bash

# Set HLS_BASE dynamically based on Render's URL
if [ -n "$RENDER_EXTERNAL_URL" ]; then
    export HLS_BASE="https://$RENDER_EXTERNAL_HOSTNAME/hls"
    echo "Setting HLS_BASE to: $HLS_BASE"
else
    export HLS_BASE="http://localhost:8890/live"
    echo "Using default HLS_BASE: $HLS_BASE"
fi

# Start supervisor to manage both services
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf