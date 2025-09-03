const StreamExtractor = require('./stream-extractor');
const path = require('path');
const { spawn } = require('child_process');
const streamState = require('./stream-state');
const proxyConfig = require('./utils/proxy-config');

/**
 * Unified Stream Manager
 * Intelligently manages both browser-based and server-side streaming
 */
class UnifiedStreamManager {
  constructor() {
    this.extractor = new StreamExtractor();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Check what tools are available
    const deps = await this.extractor.checkDependencies();
    
    this.capabilities = {
      ytdlp: deps['yt-dlp'],
      streamlink: deps['streamlink'],
      ffmpeg: deps['ffmpeg'],
      canDoServerStreaming: deps['yt-dlp'] && deps['ffmpeg']
    };
    
    console.log('Stream Manager Capabilities:', this.capabilities);
    this.initialized = true;
    
    return this.capabilities;
  }

  /**
   * Determine the best streaming method for a given URL
   */
  async analyzeUrl(url) {
    const platform = this.extractor.detectPlatform(url);
    const analysis = {
      url,
      platform,
      recommendedMethod: 'browser',
      serverSupported: false,
      metadata: null,
      reasons: []
    };

    // Check if server streaming is possible
    if (this.capabilities.canDoServerStreaming) {
      try {
        // Try to extract metadata
        const metadata = await this.extractor.extractMetadata(url);
        analysis.metadata = metadata;
        
        if (metadata.isLive) {
          analysis.serverSupported = true;
          analysis.recommendedMethod = 'server';
          analysis.reasons.push('Live stream detected - server streaming recommended');
        } else if (metadata.duration && metadata.duration > 0) {
          analysis.serverSupported = true;
          analysis.recommendedMethod = 'server';
          analysis.reasons.push('VOD content - server streaming available');
        }
        
        // Check if stream URL is accessible
        if (metadata.formats && metadata.formats.length > 0) {
          const bestFormat = metadata.formats.find(f => f.ext === 'mp4') || metadata.formats[0];
          if (bestFormat && bestFormat.url) {
            analysis.directStreamUrl = bestFormat.url;
            analysis.reasons.push('Direct stream URL available');
          }
        }
      } catch (error) {
        console.log('Server streaming not available for this URL:', error.message);
        
        // Check if it's a geo-blocking or IP restriction issue
        if (error.message.includes('429') || error.message.includes('403') || 
            error.message.includes('geo') || error.message.includes('blocked') ||
            error.message.includes('ERROR: Unable to extract uploader id')) {
          analysis.reasons.push('Server extraction blocked (likely IP restriction) - falling back to browser method');
          analysis.requiresProxy = true;
        } else {
          analysis.reasons.push('Server extraction failed - use browser method');
        }
        
        // If auto-fallback is enabled, automatically use browser method
        if (proxyConfig.config.autoFallback) {
          analysis.browserSupported = true;
          analysis.recommendedMethod = 'browser';
          console.log('Auto-fallback to browser method enabled');
        }
      }
    } else {
      analysis.reasons.push('Server streaming tools not installed');
    }

    // Platform-specific recommendations
    if (platform === 'youtube') {
      if (url.includes('live') || url.includes('/live')) {
        analysis.reasons.push('YouTube Live - may have ads and restrictions');
      }
    } else if (platform === 'twitch') {
      analysis.reasons.push('Twitch - server streaming works well');
      analysis.recommendedMethod = 'server';
    }

    return analysis;
  }

  /**
   * Start a stream using the best available method
   */
  async startStream(url, options = {}) {
    await this.initialize();
    
    const streamId = options.streamId || this.generateStreamId();
    const analysis = await this.analyzeUrl(url);
    
    // Determine method
    const method = options.forceMethod || analysis.recommendedMethod;
    
    const streamInfo = {
      streamId,
      url,
      method,
      platform: analysis.platform,
      metadata: analysis.metadata,
      startedAt: new Date(),
      status: 'starting',
      ...options
    };

    streamState.addStream(streamId, streamInfo);

    try {
      if (method === 'server' && analysis.serverSupported) {
        // Use server-side streaming
        const result = await this.startServerStream(streamId, url, analysis, options);
        streamInfo.status = 'active';
        streamInfo.serverProcess = result;
        streamState.updateStream(streamId, { status: 'active' });
      } else {
        // Use browser-based streaming (return info for client)
        streamInfo.status = 'waiting_for_browser';
        streamInfo.requiresBrowser = true;
      }

      // Publish to Nostr if requested
      if (options.publishToNostr) {
        try {
          const nostrResult = await this.publishToNostr(streamInfo);
          console.log('Nostr publish result:', nostrResult);
          // Update stream state with the npub from publishing
          const updatedInfo = streamState.getStream(streamId);
          if (updatedInfo?.npub) {
            streamInfo.npub = updatedInfo.npub;
          }
          if (updatedInfo?.generatedNsec) {
            streamInfo.generatedNsec = updatedInfo.generatedNsec;
          }
        } catch (nostrError) {
          console.warn('Failed to publish to Nostr:', nostrError.message);
          // Continue anyway - stream is still working
          streamInfo.nostrPublishError = true;
          // Generate keys even if publish failed so user can stop stream
          if (!streamInfo.nsec && !streamInfo.generatedNsec) {
            const { generateSecretKey, getPublicKey } = require('nostr-tools/pure');
            const nip19 = require('nostr-tools/nip19');
            const privateKey = generateSecretKey();
            const publicKey = getPublicKey(privateKey);
            streamInfo.generatedNsec = nip19.nsecEncode(privateKey);
            streamInfo.npub = nip19.npubEncode(publicKey);
            streamState.updateStream(streamId, { 
              generatedNsec: streamInfo.generatedNsec,
              npub: streamInfo.npub
            });
          }
        }
      } else {
        // Generate keys even if not publishing to Nostr (for stream management)
        if (!streamInfo.nsec && !streamInfo.generatedNsec) {
          const { generateSecretKey, getPublicKey } = require('nostr-tools/pure');
          const nip19 = require('nostr-tools/nip19');
          const privateKey = generateSecretKey();
          const publicKey = getPublicKey(privateKey);
          streamInfo.generatedNsec = nip19.nsecEncode(privateKey);
          streamInfo.npub = nip19.npubEncode(publicKey);
          streamState.updateStream(streamId, { 
            generatedNsec: streamInfo.generatedNsec,
            npub: streamInfo.npub
          });
        }
      }

      // Get the updated stream info with npub/nsec
      const finalStreamInfo = streamState.getStream(streamId) || streamInfo;
      
      return {
        success: true,
        streamId,
        method,
        hlsUrl: `http://localhost:8890/live/${streamId}/index.m3u8`,
        requiresBrowser: method === 'browser',
        npub: finalStreamInfo.npub,
        generatedNsec: finalStreamInfo.generatedNsec,
        title: finalStreamInfo.title || finalStreamInfo.metadata?.title,
        channelName: finalStreamInfo.metadata?.channel
      };

    } catch (error) {
      streamState.removeStream(streamId);
      throw error;
    }
  }

  /**
   * Start server-side streaming
   */
  async startServerStream(streamId, url, analysis, options) {
    console.log(`Starting server stream ${streamId} from ${url}`);
    
    // Use the extractor to start the stream
    const result = await this.extractor.startStream(url, streamId, {
      title: options.title || analysis.metadata?.title,
      channel: options.channel || analysis.metadata?.channel,
      thumbnail: analysis.metadata?.thumbnail,
      transcode: options.quality === 'high'
    });

    // Monitor stream health
    this.extractor.on('stream-ended', (data) => {
      if (data.streamId === streamId) {
        const streamInfo = streamState.getStream(streamId);
        if (streamInfo) {
          streamState.updateStream(streamId, { 
            status: 'ended',
            endedAt: new Date()
          });
        }
      }
    });

    this.extractor.on('progress', (data) => {
      if (data.streamId === streamId) {
        const streamInfo = streamState.getStream(streamId);
        if (streamInfo) {
          streamState.updateStream(streamId, { progress: data.time });
        }
      }
    });

    return result;
  }

  /**
   * Stop a stream
   */
  async stopStream(streamId, nsec = null) {
    const streamInfo = streamState.getStream(streamId);
    if (!streamInfo) {
      throw new Error('Stream not found');
    }

    // Verify ownership if nsec provided
    if (nsec && streamInfo.npub) {
      const authUtils = require('./utils/nostr-auth');
      const isOwner = authUtils.verifyNsecOwnership(nsec, streamInfo.npub);
      if (!isOwner) {
        throw new Error('Authentication failed');
      }
    }

    // Stop based on method
    if (streamInfo.method === 'server') {
      this.extractor.stopStream(streamId);
    }

    streamState.updateStream(streamId, { 
      status: 'stopped',
      stoppedAt: new Date()
    });

    return { success: true, streamId };
  }

  /**
   * Publish stream to Nostr
   */
  async publishToNostr(streamInfo) {
    // Always use the project root, not the .next directory
    const projectRoot = '/Users/dread/Documents/Island-Bitcoin/Island Bitcoin/kathreftestr';
    
    const publishArgs = [
      path.join(projectRoot, 'publish-server.js'),
      `http://localhost:8890/live/${streamInfo.streamId}/index.m3u8`
    ];

    if (streamInfo.title || streamInfo.metadata?.title) {
      publishArgs.push('--title', streamInfo.title || streamInfo.metadata.title);
    }

    if (streamInfo.nsec) {
      publishArgs.push('--nsec', streamInfo.nsec);
    }

    if (streamInfo.metadata?.thumbnail) {
      publishArgs.push('--thumbnail', streamInfo.metadata.thumbnail);
    }

    if (streamInfo.metadata?.channel) {
      publishArgs.push('--channelName', streamInfo.metadata.channel);
    }

    // Add original URL for the description
    if (streamInfo.url) {
      publishArgs.push('--originalUrl', streamInfo.url);
    }

    return new Promise((resolve, reject) => {
      console.log('Starting Nostr publish with args:', publishArgs);
      const publishProcess = spawn('node', publishArgs);
      let output = '';
      let errorOutput = '';

      publishProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log('Nostr publish stdout:', chunk);
        output += chunk;
        
        // Extract npub and nsec
        const npubMatch = output.match(/Generated npub: (npub\w+)/);
        const nsecMatch = output.match(/Save this nsec to republish updates: (nsec\w+)/);
        
        if (npubMatch) {
          streamState.updateStream(streamInfo.streamId, { npub: npubMatch[1] });
        }
        if (nsecMatch && !streamInfo.nsec) {
          streamState.updateStream(streamInfo.streamId, { generatedNsec: nsecMatch[1] });
        }
      });

      publishProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Nostr publish stderr:', error);
        errorOutput += error;
      });

      publishProcess.on('error', (error) => {
        console.error('Failed to spawn publish process:', error);
        reject(error);
      });

      publishProcess.on('exit', (code) => {
        if (code === 0) {
          const updated = streamState.getStream(streamInfo.streamId);
          resolve({ success: true, npub: updated?.npub || streamInfo.npub });
        } else {
          console.error('Nostr publish failed with code:', code);
          console.error('Error output:', errorOutput);
          reject(new Error(`Failed to publish to Nostr: ${errorOutput || 'Unknown error'}`));
        }
      });
    });
  }

  /**
   * Get stream status
   */
  getStreamStatus(streamId) {
    const streamInfo = streamState.getStream(streamId);
    if (!streamInfo) {
      return null;
    }

    return {
      streamId: streamInfo.streamId,
      status: streamInfo.status,
      method: streamInfo.method,
      platform: streamInfo.platform,
      title: streamInfo.title || streamInfo.metadata?.title,
      startedAt: streamInfo.startedAt,
      progress: streamInfo.progress,
      npub: streamInfo.npub || null,
      hlsUrl: `http://localhost:8890/live/${streamInfo.streamId}/index.m3u8`
    };
  }

  /**
   * Get all active streams
   */
  getActiveStreams() {
    return streamState.getActiveStreams()
      .map(s => this.getStreamStatus(s.streamId));
  }

  /**
   * Generate unique stream ID
   */
  generateStreamId() {
    return Math.random().toString(36).substring(2, 10);
  }
}

module.exports = UnifiedStreamManager;

// CLI usage
if (require.main === module) {
  const manager = new UnifiedStreamManager();
  
  (async () => {
    await manager.initialize();
    
    if (process.argv[2]) {
      const url = process.argv[2];
      
      // Analyze URL
      console.log('Analyzing URL...');
      const analysis = await manager.analyzeUrl(url);
      console.log('Analysis:', analysis);
      
      // Start stream
      console.log('Starting stream...');
      const result = await manager.startStream(url, {
        publishToNostr: process.argv.includes('--publish')
      });
      console.log('Stream started:', result);
      
      // Keep running
      process.on('SIGINT', () => {
        manager.stopStream(result.streamId);
        process.exit(0);
      });
    }
  })();
}