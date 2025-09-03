const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const proxyConfig = require('./utils/proxy-config');

/**
 * Modern stream extractor using yt-dlp and streamlink
 * Much more efficient than headless browser approach
 */
class StreamExtractor extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();
  }

  /**
   * Check if required tools are installed
   */
  async checkDependencies() {
    const checks = {
      'yt-dlp': false,
      'streamlink': false,
      'ffmpeg': false
    };

    for (const tool of Object.keys(checks)) {
      try {
        // Try the command directly first
        await this.runCommand(tool, ['--version']);
        checks[tool] = true;
      } catch (e) {
        // For ffmpeg, try common installation paths
        if (tool === 'ffmpeg') {
          const ffmpegPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
          for (const ffmpegPath of ffmpegPaths) {
            try {
              if (fs.existsSync(ffmpegPath)) {
                await this.runCommand(ffmpegPath, ['-version']);
                checks[tool] = true;
                this.ffmpegPath = ffmpegPath; // Store the working path
                break;
              }
            } catch (e2) {
              // Continue to next path
            }
          }
        }
        
        if (!checks[tool]) {
          console.log(`${tool} not found. Install with: ${this.getInstallCommand(tool)}`);
        }
      }
    }

    return checks;
  }

  getInstallCommand(tool) {
    const commands = {
      'yt-dlp': 'pip install yt-dlp or brew install yt-dlp',
      'streamlink': 'pip install streamlink or brew install streamlink',
      'ffmpeg': 'brew install ffmpeg'
    };
    return commands[tool] || `Please install ${tool}`;
  }

  /**
   * Extract metadata using yt-dlp (works for YouTube, Twitch, and 1000+ sites)
   */
  async extractMetadata(url) {
    try {
      const args = [
        '--dump-json',
        '--no-playlist',
        ...proxyConfig.getYtDlpArgs(),
        url
      ];
      
      const output = await this.runCommand('yt-dlp', args);

      const metadata = JSON.parse(output);
      
      return {
        title: metadata.title || '',
        channel: metadata.channel || metadata.uploader || '',
        channelId: metadata.channel_id || metadata.uploader_id || '',
        thumbnail: metadata.thumbnail || '',
        description: metadata.description || '',
        isLive: metadata.is_live || false,
        duration: metadata.duration || 0,
        viewCount: metadata.view_count || 0,
        formats: metadata.formats || [],
        streamUrl: metadata.url || '',
        platform: this.detectPlatform(url)
      };
    } catch (error) {
      console.error('Metadata extraction failed:', error);
      throw error;
    }
  }

  /**
   * Start streaming using the most efficient method
   */
  async startStream(url, streamId, options = {}) {
    if (this.activeStreams.has(streamId)) {
      throw new Error('Stream already active');
    }

    const platform = this.detectPlatform(url);
    const rtmpUrl = `rtmp://localhost:1935/live/${streamId}`;

    let streamProcess;

    try {
      // Choose the best tool for the platform
      if (platform === 'youtube' || platform === 'twitch') {
        streamProcess = await this.startYtDlpStream(url, rtmpUrl, options);
      } else {
        streamProcess = await this.startStreamlinkStream(url, rtmpUrl, options);
      }

      const streamInfo = {
        process: streamProcess,
        url: url,
        streamId: streamId,
        startedAt: new Date(),
        platform: platform,
        ...options
      };

      this.activeStreams.set(streamId, streamInfo);

      // Monitor the stream
      this.monitorStream(streamId, streamProcess);

      return {
        success: true,
        streamId: streamId,
        hlsUrl: `http://localhost:8890/live/${streamId}/index.m3u8`,
        platform: platform
      };

    } catch (error) {
      console.error('Failed to start stream:', error);
      throw error;
    }
  }

  /**
   * Start stream using yt-dlp + ffmpeg (most reliable for YouTube)
   */
  async startYtDlpStream(url, rtmpUrl, options) {
    console.log('Starting stream with yt-dlp...');

    // First get the best stream URL with proxy support
    const ytdlpArgs = [
      '-f', 'best[ext=mp4]/best',
      '--get-url',
      '--no-playlist',
      ...proxyConfig.getYtDlpArgs(),
      url
    ];
    
    const streamUrl = await this.runCommand('yt-dlp', ytdlpArgs, {
      env: proxyConfig.getEnvironment()
    });

    // Use ffmpeg to re-stream to RTMP
    const ffmpegArgs = [
      '-re', // Read input at native frame rate
      '-i', streamUrl.trim(),
      '-c:v', 'copy', // Copy video codec (no re-encoding if possible)
      '-c:a', 'aac', // Ensure audio is AAC
      '-b:a', '128k',
      '-f', 'flv',
      rtmpUrl
    ];

    // Add custom video encoding if needed
    if (options.transcode) {
      ffmpegArgs[ffmpegArgs.indexOf('-c:v')] = '-c:v';
      ffmpegArgs[ffmpegArgs.indexOf('copy')] = 'libx264';
      ffmpegArgs.push('-preset', 'veryfast');
      ffmpegArgs.push('-b:v', '2500k');
    }

    const ffmpegCmd = this.ffmpegPath || 'ffmpeg';
    const ffmpeg = spawn(ffmpegCmd, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      // Parse ffmpeg output for progress
      const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2})/);
      if (timeMatch) {
        this.emit('progress', { streamId: options.streamId, time: timeMatch[1] });
      }
    });

    return ffmpeg;
  }

  /**
   * Start stream using streamlink (good for Twitch and others)
   */
  async startStreamlinkStream(url, rtmpUrl, options) {
    console.log('Starting stream with streamlink...');

    const streamlinkArgs = [
      ...proxyConfig.getStreamlinkArgs(),
      url,
      'best', // Quality
      '-O' // Output to stdout
    ];

    const streamlink = spawn('streamlink', streamlinkArgs, {
      env: proxyConfig.getEnvironment()
    });

    // Pipe through ffmpeg to RTMP
    const ffmpegCmd = this.ffmpegPath || 'ffmpeg';
    const ffmpeg = spawn(ffmpegCmd, [
      '-re',
      '-i', 'pipe:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-f', 'flv',
      rtmpUrl
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    streamlink.stdout.pipe(ffmpeg.stdin);

    return ffmpeg;
  }

  /**
   * Monitor stream health and auto-restart if needed
   */
  monitorStream(streamId, process) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) return;

    let restartAttempts = 0;
    const maxRestarts = 3;

    process.on('exit', async (code) => {
      console.log(`Stream ${streamId} exited with code ${code}`);
      
      if (code !== 0 && restartAttempts < maxRestarts) {
        console.log(`Attempting to restart stream (attempt ${restartAttempts + 1}/${maxRestarts})`);
        restartAttempts++;
        
        // Wait a bit before restarting
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          const newProcess = await this.startStream(
            streamInfo.url,
            streamId,
            streamInfo
          );
          
          // Update the process reference
          streamInfo.process = newProcess.process;
          this.monitorStream(streamId, newProcess.process);
        } catch (error) {
          console.error('Failed to restart stream:', error);
          this.activeStreams.delete(streamId);
          this.emit('stream-ended', { streamId, error });
        }
      } else {
        this.activeStreams.delete(streamId);
        this.emit('stream-ended', { streamId, code });
      }
    });

    process.on('error', (error) => {
      console.error(`Stream ${streamId} error:`, error);
      this.emit('stream-error', { streamId, error });
    });
  }

  /**
   * Stop a stream
   */
  stopStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) {
      return false;
    }

    try {
      streamInfo.process.kill('SIGTERM');
      this.activeStreams.delete(streamId);
      return true;
    } catch (error) {
      console.error('Error stopping stream:', error);
      return false;
    }
  }

  /**
   * Get all active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([id, info]) => ({
      streamId: id,
      url: info.url,
      platform: info.platform,
      startedAt: info.startedAt,
      title: info.title
    }));
  }

  /**
   * Detect platform from URL
   */
  detectPlatform(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('twitch.tv')) return 'twitch';
    if (url.includes('kick.com')) return 'kick';
    if (url.includes('rumble.com')) return 'rumble';
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    return 'unknown';
  }

  /**
   * Helper to run commands and get output
   */
  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const spawnOptions = {
        ...options
      };
      const proc = spawn(command, args, spawnOptions);
      let output = '';
      let error = '';

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          output += data.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          error += data.toString();
        });
      }

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || `Command failed with code ${code}`));
        }
      });
    });
  }
}

module.exports = StreamExtractor;

// Example usage
if (require.main === module) {
  const extractor = new StreamExtractor();
  
  (async () => {
    // Check dependencies
    const deps = await extractor.checkDependencies();
    console.log('Dependencies:', deps);
    
    // Example: Extract metadata
    if (process.argv[2]) {
      try {
        const metadata = await extractor.extractMetadata(process.argv[2]);
        console.log('Metadata:', metadata);
        
        // Start streaming
        const streamId = 'test-' + Date.now();
        const result = await extractor.startStream(process.argv[2], streamId);
        console.log('Streaming started:', result);
        
        // Keep running
        process.on('SIGINT', () => {
          extractor.stopStream(streamId);
          process.exit(0);
        });
        
      } catch (error) {
        console.error('Error:', error);
      }
    }
  })();
}