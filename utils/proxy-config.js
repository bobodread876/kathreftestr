/**
 * Proxy configuration for cloud deployments
 * Supports HTTP, SOCKS5, and Tor proxies
 */

const fs = require('fs');
const path = require('path');

class ProxyConfig {
  constructor() {
    this.configPath = path.join(__dirname, '..', '.proxy-config.json');
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } else {
        this.config = this.getDefaultConfig();
      }
    } catch (error) {
      console.error('Error loading proxy config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      // Check environment variables first
      enabled: process.env.PROXY_ENABLED === 'true',
      type: process.env.PROXY_TYPE || 'none', // 'none', 'http', 'socks5', 'tor'
      host: process.env.PROXY_HOST || '',
      port: process.env.PROXY_PORT || '',
      username: process.env.PROXY_USERNAME || '',
      password: process.env.PROXY_PASSWORD || '',
      
      // Tor-specific settings
      torPort: process.env.TOR_PORT || '9050',
      
      // Auto-fallback settings
      autoFallback: process.env.AUTO_FALLBACK !== 'false', // Default true
      fallbackDelay: parseInt(process.env.FALLBACK_DELAY || '5000'), // 5 seconds
      
      // Rotating proxy support
      rotateProxies: process.env.ROTATE_PROXIES === 'true',
      proxyList: process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : []
    };
  }

  saveConfig(config) {
    this.config = { ...this.config, ...config };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getYtDlpArgs() {
    const args = [];
    
    if (!this.config.enabled) return args;
    
    switch (this.config.type) {
      case 'http':
        if (this.config.host && this.config.port) {
          const proxyUrl = this.config.username && this.config.password
            ? `http://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}`
            : `http://${this.config.host}:${this.config.port}`;
          args.push('--proxy', proxyUrl);
        }
        break;
        
      case 'socks5':
        if (this.config.host && this.config.port) {
          const proxyUrl = this.config.username && this.config.password
            ? `socks5://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}`
            : `socks5://${this.config.host}:${this.config.port}`;
          args.push('--proxy', proxyUrl);
        }
        break;
        
      case 'tor':
        args.push('--proxy', `socks5://127.0.0.1:${this.config.torPort}`);
        break;
    }
    
    // Add user agent to avoid detection
    args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Add cookies if provided
    if (process.env.YOUTUBE_COOKIES_FILE) {
      args.push('--cookies', process.env.YOUTUBE_COOKIES_FILE);
    }
    
    return args;
  }

  getStreamlinkArgs() {
    const args = [];
    
    if (!this.config.enabled) return args;
    
    switch (this.config.type) {
      case 'http':
      case 'socks5':
        if (this.config.host && this.config.port) {
          const protocol = this.config.type === 'socks5' ? 'socks5h' : 'http';
          const proxyUrl = this.config.username && this.config.password
            ? `${protocol}://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}`
            : `${protocol}://${this.config.host}:${this.config.port}`;
          args.push('--http-proxy', proxyUrl);
        }
        break;
        
      case 'tor':
        args.push('--http-proxy', `socks5h://127.0.0.1:${this.config.torPort}`);
        break;
    }
    
    return args;
  }

  getFfmpegArgs() {
    const args = [];
    
    if (!this.config.enabled) return args;
    
    // FFmpeg uses http_proxy environment variable
    // We'll set it in the environment instead of command line
    return args;
  }

  getEnvironment() {
    const env = { ...process.env };
    
    if (!this.config.enabled) return env;
    
    switch (this.config.type) {
      case 'http':
        if (this.config.host && this.config.port) {
          const proxyUrl = this.config.username && this.config.password
            ? `http://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}`
            : `http://${this.config.host}:${this.config.port}`;
          env.HTTP_PROXY = proxyUrl;
          env.HTTPS_PROXY = proxyUrl;
          env.http_proxy = proxyUrl;
          env.https_proxy = proxyUrl;
        }
        break;
        
      case 'socks5':
      case 'tor':
        const port = this.config.type === 'tor' ? this.config.torPort : this.config.port;
        const host = this.config.type === 'tor' ? '127.0.0.1' : this.config.host;
        if (host && port) {
          const proxyUrl = this.config.username && this.config.password && this.config.type !== 'tor'
            ? `socks5://${this.config.username}:${this.config.password}@${host}:${port}`
            : `socks5://${host}:${port}`;
          env.ALL_PROXY = proxyUrl;
          env.all_proxy = proxyUrl;
        }
        break;
    }
    
    return env;
  }

  // Get next proxy from rotation list
  getNextProxy() {
    if (!this.config.rotateProxies || !this.config.proxyList.length) {
      return null;
    }
    
    // Simple round-robin rotation
    if (!this.currentProxyIndex) {
      this.currentProxyIndex = 0;
    }
    
    const proxy = this.config.proxyList[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.config.proxyList.length;
    
    // Parse proxy string (format: type://user:pass@host:port)
    const match = proxy.match(/^(\w+):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/);
    if (match) {
      return {
        type: match[1],
        username: match[2] || '',
        password: match[3] || '',
        host: match[4],
        port: match[5]
      };
    }
    
    return null;
  }

  // Test proxy connectivity
  async testProxy() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      const proxyArgs = this.getYtDlpArgs();
      const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // First YouTube video
      
      const command = `yt-dlp ${proxyArgs.join(' ')} --simulate --quiet "${testUrl}"`;
      await execAsync(command, { timeout: 10000 });
      
      return { success: true, message: 'Proxy is working' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = new ProxyConfig();