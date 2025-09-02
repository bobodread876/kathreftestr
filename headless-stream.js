const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const { extractYouTubeVideoId, getYouTubeThumbnail } = require('./utils/youtube');

class HeadlessStreamer {
  constructor() {
    this.browser = null;
    this.page = null;
    this.ffmpegProcess = null;
    this.streamId = null;
    this.isStreaming = false;
    this.errorMonitorInterval = null;
    this.isRecovering = false;
  }

  async initialize() {
    console.log('Launching headless browser...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-features=ScreenCaptureWithoutGesture',
        // Audio flags
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--enable-usermedia-screen-capturing',
        '--allow-running-insecure-content',
        '--disable-features=site-per-process'
      ],
      ignoreDefaultArgs: ['--mute-audio']
    });
    
    this.page = await this.browser.newPage();
    
    // Set viewport to 1080p
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    // Grant permissions for media
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions('https://www.youtube.com', ['camera', 'microphone']);
    
    // Bypass YouTube's bot detection
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' })
        })
      });
    });
    
    // Set user agent to look like a real browser
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Headless browser initialized');
  }

  async skipAdsIfPresent() {
    try {
      // Check for ad indicator
      const adPlaying = await this.page.evaluate(() => {
        const adIndicator = document.querySelector('.ytp-ad-player-overlay');
        const adBadge = document.querySelector('.ytp-ad-badge');
        return !!(adIndicator || adBadge);
      });
      
      if (adPlaying) {
        console.log('Ad detected, attempting to skip...');
        
        // Try to click skip button if available
        try {
          await this.page.waitForSelector('.ytp-ad-skip-button', { timeout: 5000 });
          await this.page.click('.ytp-ad-skip-button');
          console.log('Skipped ad');
        } catch (e) {
          console.log('Skip button not available, waiting for ad to finish...');
          
          // Wait for ad to finish (max 30 seconds)
          await this.page.waitForFunction(
            () => {
              const adIndicator = document.querySelector('.ytp-ad-player-overlay');
              const adBadge = document.querySelector('.ytp-ad-badge');
              return !(adIndicator || adBadge);
            },
            { timeout: 30000 }
          );
          console.log('Ad finished');
        }
      }
    } catch (e) {
      console.log('Error checking for ads:', e.message);
    }
  }

  async makeFullscreen() {
    try {
      console.log('Attempting to make video fullscreen...');
      
      // Try multiple methods to go fullscreen
      const fullscreenSuccess = await this.page.evaluate(() => {
        const video = document.querySelector('video');
        const player = document.querySelector('.html5-video-player');
        
        // Method 1: Click fullscreen button
        const fullscreenBtn = document.querySelector('.ytp-fullscreen-button');
        if (fullscreenBtn) {
          fullscreenBtn.click();
          return 'button';
        }
        
        // Method 2: Double click on video
        if (video) {
          const event = new MouseEvent('dblclick', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          video.dispatchEvent(event);
          return 'dblclick';
        }
        
        // Method 3: Press 'f' key
        if (player) {
          const event = new KeyboardEvent('keydown', {
            key: 'f',
            code: 'KeyF',
            keyCode: 70,
            bubbles: true
          });
          player.dispatchEvent(event);
          return 'keyboard';
        }
        
        return false;
      });
      
      if (fullscreenSuccess) {
        console.log(`Made video fullscreen using ${fullscreenSuccess} method`);
        // Wait a bit for fullscreen to activate
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('Could not make video fullscreen, continuing anyway');
      }
    } catch (e) {
      console.log('Error making fullscreen:', e.message);
    }
  }

  startErrorMonitoring() {
    if (this.errorMonitorInterval) {
      clearInterval(this.errorMonitorInterval);
    }
    
    let lastVideoTime = 0;
    let stalledCount = 0;
    
    this.errorMonitorInterval = setInterval(async () => {
      if (!this.isStreaming || !this.page || this.isRecovering) return;
      
      try {
        // Check for specific YouTube error messages
        const errorInfo = await this.page.evaluate(() => {
          // Look for actual error overlays
          const errorOverlay = document.querySelector('.ytp-error-content-wrap-subreason');
          const playbackError = document.querySelector('.ytp-error');
          const offlineMessage = document.querySelector('.ytp-offline-slate');
          
          // Check if error text is visible
          const errorTextElement = document.querySelector('.ytp-error-content-wrap-reason');
          const hasVisibleError = errorTextElement && errorTextElement.offsetHeight > 0;
          
          // Get video state
          const video = document.querySelector('video');
          const videoState = video ? {
            paused: video.paused,
            currentTime: video.currentTime,
            duration: video.duration,
            readyState: video.readyState,
            networkState: video.networkState,
            ended: video.ended
          } : null;
          
          return {
            hasError: !!(errorOverlay || (playbackError && hasVisibleError) || offlineMessage),
            errorText: errorTextElement?.textContent || '',
            videoState
          };
        });
        
        // Only trigger recovery for actual errors
        if (errorInfo.hasError && errorInfo.errorText) {
          console.log(`YouTube error detected: "${errorInfo.errorText}"`);
          stalledCount = 0; // Reset stalled count
          await this.recoverFromError();
          return;
        }
        
        // Check if video is truly stalled (not just buffering)
        if (errorInfo.videoState) {
          const { currentTime, paused, readyState, ended } = errorInfo.videoState;
          
          // Don't check if video has ended
          if (ended) {
            console.log('Video has ended');
            return;
          }
          
          // Check if video time is progressing
          if (currentTime === lastVideoTime && !paused && readyState >= 2) {
            stalledCount++;
            console.log(`Video may be stalled (count: ${stalledCount})`);
            
            // Only recover after being stalled for multiple checks
            if (stalledCount >= 3) {
              console.log('Video confirmed stalled, attempting recovery...');
              stalledCount = 0;
              await this.recoverFromError();
              return;
            }
          } else {
            stalledCount = 0; // Reset if video is progressing
          }
          
          lastVideoTime = currentTime;
          
          // Try to play if paused (but not if we're recovering)
          if (paused && !ended) {
            console.log('Video is paused, attempting to play...');
            await this.page.evaluate(() => {
              const video = document.querySelector('video');
              if (video && !video.ended) {
                video.play().catch(e => console.log('Play failed:', e));
              }
            });
          }
        }
        
      } catch (e) {
        console.error('Error in monitoring:', e.message);
      }
    }, 10000); // Check every 10 seconds (less aggressive)
  }

  async recoverFromError() {
    if (this.isRecovering) return;
    this.isRecovering = true;
    
    try {
      console.log('Attempting recovery: refreshing page...');
      
      // Store the current URL
      const currentUrl = this.page.url();
      
      // Reload the page
      await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait a bit for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for video element
      await this.page.waitForSelector('video', { timeout: 10000 });
      
      // Skip ads if present
      await this.skipAdsIfPresent();
      
      // Wait a bit more before trying to play
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to play video
      await this.page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.paused) {
          video.play().catch(e => console.log('Autoplay failed:', e));
        }
      });
      
      // Try clicking play button if needed
      const isPlaying = await this.page.evaluate(() => {
        const video = document.querySelector('video');
        return video && !video.paused;
      });
      
      if (!isPlaying) {
        try {
          await this.page.click('.ytp-play-button[aria-label="Play"]');
          console.log('Clicked play button');
        } catch (e) {
          // Button might not be there
        }
      }
      
      console.log('Recovery attempt completed');
      
      // Wait before resuming normal monitoring
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (e) {
      console.error('Recovery failed:', e.message);
    } finally {
      this.isRecovering = false;
    }
  }

  async startStream(url, options = {}) {
    if (this.isStreaming) {
      throw new Error('Already streaming');
    }
    
    try {
      this.streamId = options.streamId || Math.random().toString(36).substring(2, 10);
      const rtmpUrl = `rtmp://localhost:1935/live/${this.streamId}`;
      
      console.log(`Starting headless stream for ${url}`);
      console.log(`Stream ID: ${this.streamId}`);
      
      // Navigate to YouTube
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for video player to load
      await this.page.waitForSelector('video', { timeout: 10000 });
      
      // Dismiss any popups or consent forms first
      try {
        await this.page.click('[aria-label="Accept all"]', { timeout: 3000 });
      } catch (e) {
        // No consent form, continue
      }
      
      // Skip ads if present
      await this.skipAdsIfPresent();
      
      // Auto-play video if needed
      await this.page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.paused) {
          video.play().catch(e => console.log('Autoplay failed:', e));
        }
      });
      
      // Try to click play button if video doesn't start
      try {
        await this.page.click('.ytp-play-button[aria-label="Play"]');
      } catch (e) {
        console.log('Play button not found or video already playing');
      }
      
      // Make video fullscreen for better capture
      await this.makeFullscreen();
      
      // Start monitoring for errors and handle them
      this.startErrorMonitoring();
      
      // Get video metadata
      const videoTitle = await this.page.evaluate(() => {
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
        return titleEl ? titleEl.textContent : '';
      });
      
      const channelName = await this.page.evaluate(() => {
        const channelEl = document.querySelector('#channel-name a');
        return channelEl ? channelEl.textContent.trim() : '';
      });
      
      console.log(`Video Title: ${videoTitle}`);
      console.log(`Channel: ${channelName}`);
      
      // Set up video and audio capture using Chrome DevTools Protocol
      const client = await this.page.target().createCDPSession();
      
      // Start screen capture
      await client.send('Page.startScreencast', {
        format: 'png',
        quality: 80,
        maxWidth: 1920,
        maxHeight: 1080,
        everyNthFrame: 1
      });
      
      // Create ffmpeg process to convert screenshots to RTMP stream
      this.ffmpegProcess = spawn('ffmpeg', [
        '-f', 'image2pipe',
        '-framerate', '30',
        '-i', 'pipe:0',
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
        '-f', 'flv',
        rtmpUrl
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      this.ffmpegProcess.stderr.on('data', (data) => {
        console.log(`[ffmpeg ${this.streamId}]:`, data.toString());
      });
      
      this.ffmpegProcess.on('exit', (code) => {
        console.log(`[ffmpeg ${this.streamId}] exited with code ${code}`);
        this.isStreaming = false;
      });
      
      // Handle screencast frames
      client.on('Page.screencastFrame', async (frame) => {
        if (!this.isStreaming || !this.ffmpegProcess) return;
        
        // Acknowledge frame
        await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
        
        // Send frame to ffmpeg
        const imageBuffer = Buffer.from(frame.data, 'base64');
        if (this.ffmpegProcess && this.ffmpegProcess.stdin.writable) {
          this.ffmpegProcess.stdin.write(imageBuffer);
        }
      });
      
      this.isStreaming = true;
      
      // Auto-publish to Nostr if requested
      if (options.publishToNostr) {
        const hlsUrl = `http://localhost:8890/live/${this.streamId}/index.m3u8`;
        const thumbnail = getYouTubeThumbnail(url);
        
        const publishArgs = [
          path.join(__dirname, 'publish-server.js'),
          hlsUrl
        ];
        
        if (options.title || videoTitle) {
          publishArgs.push('--title', options.title || videoTitle);
        }
        
        if (options.nsec) {
          publishArgs.push('--nsec', options.nsec);
        }
        
        if (thumbnail) {
          publishArgs.push('--thumbnail', thumbnail);
        }
        
        if (channelName) {
          publishArgs.push('--channelName', channelName);
        }
        
        console.log('Auto-publishing to Nostr...');
        const publishProcess = spawn('node', publishArgs);
        
        publishProcess.stdout.on('data', (data) => {
          console.log(data.toString());
        });
        
        publishProcess.stderr.on('data', (data) => {
          console.error('Publish error:', data.toString());
        });
      }
      
      return {
        success: true,
        streamId: this.streamId,
        hlsUrl: `http://localhost:8890/live/${this.streamId}/index.m3u8`,
        title: videoTitle,
        channelName: channelName,
        thumbnail: getYouTubeThumbnail(url)
      };
      
    } catch (error) {
      console.error('Error starting stream:', error);
      this.isStreaming = false;
      throw error;
    }
  }

  async stopStream() {
    console.log('Stopping headless stream...');
    
    this.isStreaming = false;
    
    // Clear monitoring interval
    if (this.errorMonitorInterval) {
      clearInterval(this.errorMonitorInterval);
      this.errorMonitorInterval = null;
    }
    
    if (this.ffmpegProcess) {
      this.ffmpegProcess.stdin.end();
      this.ffmpegProcess.kill();
      this.ffmpegProcess = null;
    }
    
    if (this.page) {
      try {
        const client = await this.page.target().createCDPSession();
        await client.send('Page.stopScreencast');
      } catch (e) {
        console.error('Error stopping screencast:', e);
      }
    }
    
    this.streamId = null;
    console.log('Stream stopped');
  }

  async cleanup() {
    await this.stopStream();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = HeadlessStreamer;

// If running directly as a script
if (require.main === module) {
  const args = process.argv.slice(2);
  const url = args[0];
  
  if (!url) {
    console.log('Usage: node headless-stream.js <youtube-url> [--publish]');
    process.exit(1);
  }
  
  const streamer = new HeadlessStreamer();
  
  (async () => {
    try {
      await streamer.initialize();
      
      const result = await streamer.startStream(url, {
        publishToNostr: args.includes('--publish')
      });
      
      console.log('Stream started:', result);
      
      // Keep running until interrupted
      process.on('SIGINT', async () => {
        console.log('\nStopping stream...');
        await streamer.cleanup();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('Fatal error:', error);
      await streamer.cleanup();
      process.exit(1);
    }
  })();
}