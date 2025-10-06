// WebRTC P2P networking with PeerJS - optimized for low latency
class NetworkManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.isHost = false;
    this.roomId = null;

    // P2P connections
    this.connections = new Map(); // peerId -> DataConnection
    this.hostConnection = null; // For clients: connection to host

    // Heartbeat tracking
    this.lastHeartbeat = new Map(); // peerId -> timestamp
    this.heartbeatInterval = null;
    this.heartbeatCheckInterval = null;

    // Event handlers
    this.handlers = {
      onConnect: null,
      onDisconnect: null,
      onData: null
    };
  }

  // Initialize PeerJS
  async init() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PeerJS connection timeout'));
      }, 10000);

      // Use PeerJS cloud server
      this.peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.peerId = id;
        console.log('✅ PeerJS connected:', this.peerId);
        resolve(this.peerId);
      });

      this.peer.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ PeerJS error:', error);
        reject(error);
      });

      // Listen for incoming connections (host only)
      this.peer.on('connection', (conn) => {
        console.log('📥 Incoming connection from:', conn.peer);
        this.setupConnection(conn);
      });
    });
  }

  // Setup DataConnection with optimal settings
  setupConnection(conn) {
    // Wait for connection to open
    conn.on('open', () => {
      console.log('✅ Connection opened with:', conn.peer);
      this.connections.set(conn.peer, conn);
      this.lastHeartbeat.set(conn.peer, Date.now());

      if (this.handlers.onConnect) {
        this.handlers.onConnect(conn.peer);
      }
    });

    // Handle incoming data
    conn.on('data', (data) => {
      // Update heartbeat timestamp for any received data
      this.lastHeartbeat.set(conn.peer, Date.now());

      // Handle ping/pong
      if (data.type === 'ping') {
        // Client responds to host's ping
        conn.send({ type: 'pong' });
        return;
      } else if (data.type === 'pong') {
        // Host receives pong from client
        return;
      }

      if (this.handlers.onData) {
        this.handlers.onData(conn.peer, data);
      }
    });

    // Handle disconnection
    conn.on('close', () => {
      console.log('❌ Connection closed:', conn.peer);
      this.cleanupConnection(conn.peer);
    });

    conn.on('error', (error) => {
      console.error('❌ Connection error with', conn.peer, ':', error);
      this.cleanupConnection(conn.peer);
    });

    // Check connection status periodically (for detecting disconnects)
    const checkInterval = setInterval(() => {
      if (!conn.open && this.connections.has(conn.peer)) {
        console.log('⚠️ Detected closed connection:', conn.peer);
        this.cleanupConnection(conn.peer);
        clearInterval(checkInterval);
      }
    }, 1000);

    // Store interval reference for cleanup
    conn._checkInterval = checkInterval;
  }

  // Cleanup connection and notify disconnect
  cleanupConnection(peerId) {
    const wasConnected = this.connections.has(peerId);

    this.connections.delete(peerId);
    this.lastHeartbeat.delete(peerId);

    if (wasConnected && this.handlers.onDisconnect) {
      this.handlers.onDisconnect(peerId);
    }
  }

  // Create room (become host)
  async createRoom() {
    this.isHost = true;
    this.roomId = this.peerId; // Use Peer ID as room code

    // Start heartbeat system for host
    this.startHeartbeat();

    console.log('🏠 Room created:', this.roomId);
    return this.roomId;
  }

  // Start heartbeat system (host only)
  startHeartbeat() {
    if (!this.isHost) return;

    // Send ping to all clients every 3 seconds
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((conn, peerId) => {
        if (conn.open) {
          conn.send({ type: 'ping' });
        }
      });
    }, 3000);

    // Check for dead connections every 5 seconds
    this.heartbeatCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 10000; // 10 seconds timeout

      this.lastHeartbeat.forEach((lastTime, peerId) => {
        if (now - lastTime > timeout) {
          console.log('💀 Heartbeat timeout for:', peerId);
          this.cleanupConnection(peerId);
        }
      });
    }, 5000);

    console.log('💓 Heartbeat system started');
  }

  // Stop heartbeat system
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }

  // Join room (become client)
  async joinRoom(hostPeerId) {
    this.roomId = hostPeerId;
    this.isHost = false;

    console.log('🔗 Connecting to host:', hostPeerId);

    // Connect to host with optimized DataChannel settings
    const conn = this.peer.connect(hostPeerId, {
      reliable: false, // UDP-like behavior
      serialization: 'json'
    });

    this.hostConnection = conn;
    this.setupConnection(conn);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout - Host may be offline'));
      }, 10000);

      conn.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ Connected to host');
        resolve();
      });

      conn.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Send data to all clients (host only)
  send(data) {
    if (!this.isHost) {
      console.error('❌ Only host can broadcast');
      return;
    }

    this.connections.forEach((conn, peerId) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  }

  // Send data to specific peer (host only)
  sendTo(peerId, data) {
    if (!this.isHost) {
      console.error('❌ Only host can send to specific peer');
      return;
    }

    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(data);
    }
  }

  // Send data to host (client only)
  sendToHost(data) {
    if (this.isHost) {
      console.error('❌ Host cannot send to itself');
      return;
    }

    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  // Set event handlers
  onConnect(handler) {
    this.handlers.onConnect = handler;
  }

  onDisconnect(handler) {
    this.handlers.onDisconnect = handler;
  }

  onData(handler) {
    this.handlers.onData = handler;
  }

  // Cleanup
  destroy() {
    // Stop heartbeat
    this.stopHeartbeat();

    this.connections.forEach(conn => {
      if (conn._checkInterval) {
        clearInterval(conn._checkInterval);
      }
      conn.close();
    });
    this.connections.clear();
    this.lastHeartbeat.clear();

    if (this.hostConnection) {
      if (this.hostConnection._checkInterval) {
        clearInterval(this.hostConnection._checkInterval);
      }
      this.hostConnection.close();
    }

    if (this.peer) {
      this.peer.destroy();
    }
  }
}
