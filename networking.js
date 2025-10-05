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

    // Event handlers
    this.handlers = {
      onConnect: null,
      onDisconnect: null,
      onData: null
    };

    // Firebase (for room management)
    this.db = null;
    this.roomRef = null;
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

      if (this.handlers.onConnect) {
        this.handlers.onConnect(conn.peer);
      }
    });

    // Handle incoming data
    conn.on('data', (data) => {
      if (this.handlers.onData) {
        this.handlers.onData(conn.peer, data);
      }
    });

    // Handle disconnection
    conn.on('close', () => {
      console.log('❌ Connection closed:', conn.peer);
      this.connections.delete(conn.peer);

      if (this.handlers.onDisconnect) {
        this.handlers.onDisconnect(conn.peer);
      }
    });

    conn.on('error', (error) => {
      console.error('❌ Connection error:', error);
    });
  }

  // Create room (become host)
  async createRoom() {
    this.isHost = true;
    this.roomId = this.peerId; // Use Peer ID as room code

    console.log('🏠 Room created:', this.roomId);
    return this.roomId;
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
    this.connections.forEach(conn => conn.close());
    this.connections.clear();

    if (this.hostConnection) {
      this.hostConnection.close();
    }

    if (this.peer) {
      this.peer.destroy();
    }
  }
}
