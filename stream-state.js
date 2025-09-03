const fs = require('fs');
const path = require('path');

/**
 * Simple file-based persistence for active streams
 * Survives hot reloads and API restarts
 */
class StreamState {
  constructor() {
    this.statePath = path.join(__dirname, '.stream-state.json');
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf8');
        this.streams = JSON.parse(data);
      } else {
        this.streams = {};
      }
    } catch (error) {
      console.error('Error loading stream state:', error);
      this.streams = {};
    }
  }

  saveState() {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.streams, null, 2));
    } catch (error) {
      console.error('Error saving stream state:', error);
    }
  }

  addStream(streamId, streamInfo) {
    this.streams[streamId] = {
      ...streamInfo,
      startedAt: streamInfo.startedAt || new Date().toISOString()
    };
    this.saveState();
  }

  updateStream(streamId, updates) {
    if (this.streams[streamId]) {
      this.streams[streamId] = {
        ...this.streams[streamId],
        ...updates
      };
      this.saveState();
    }
  }

  removeStream(streamId) {
    delete this.streams[streamId];
    this.saveState();
  }

  getStream(streamId) {
    return this.streams[streamId];
  }

  getAllStreams() {
    return Object.values(this.streams);
  }

  getActiveStreams() {
    return Object.values(this.streams).filter(s => 
      s.status === 'active' || s.status === 'waiting_for_browser'
    );
  }

  clearAll() {
    this.streams = {};
    this.saveState();
  }
}

// Export singleton instance
module.exports = new StreamState();