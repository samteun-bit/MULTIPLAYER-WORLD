// WebRTC Networking Manager using PeerJS (No Firebase - Direct Peer Connection)
class NetworkManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.isHost = false;

    // For host: connections to all clients
    this.connections = new Map(); // peerId -> DataConnection

    // For client: connection to host
    this.hostConnection = null;

    // Callbacks
    this.onPlayerJoinedCallback = null;
    this.onPlayerLeftCallback = null;
    this.onGameStateCallback = null;
    this.onInputCallback = null;
    this.onInitCallback = null;
  }

  // Initialize PeerJS
  async initialize() {
    return new Promise((resolve, reject) => {
      // Add timeout for initial connection
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout - PeerJS server not responding'));
      }, 15000); // 15 second timeout

      // Connect to PeerJS cloud server with multiple STUN servers
      this.peer = new Peer({
        debug: 1, // Reduce debug verbosity
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        console.log('PeerJS connected with ID:', id);
        this.peerId = id;
        resolve(id);
      });

      this.peer.on('error', (error) => {
        clearTimeout(timeout);
        console.error('PeerJS error:', error);

        // Handle different error types
        if (error.type === 'unavailable-id') {
          reject(new Error('Peer ID unavailable - please refresh'));
        } else if (error.type === 'network') {
          reject(new Error('Network error - check your internet connection'));
        } else if (error.type === 'peer-unavailable') {
          // Don't reject for peer-unavailable (happens when trying to connect to offline peer)
          console.warn('Peer unavailable:', error);
        } else {
          reject(error);
        }
      });

      // Handle incoming connections (for host)
      this.peer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer);
        this.setupConnection(conn);
      });

      // Handle disconnection
      this.peer.on('disconnected', () => {
        console.warn('Disconnected from PeerJS server, attempting to reconnect...');
        // PeerJS will automatically attempt to reconnect
      });
    });
  }

  // Create a new room (become host)
  async createRoom(playerName = 'Host') {
    return new Promise((resolve) => {
      this.isHost = true;
      console.log('Room created with Peer ID:', this.peerId);
      // Return the peer ID as the room code
      resolve(this.peerId);
    });
  }

  // Join an existing room (become client)
  async joinRoom(hostPeerId, playerName = 'Player') {
    return new Promise((resolve, reject) => {
      this.isHost = false;

      // Connect to host via WebRTC using the host's peer ID
      console.log('Connecting to host:', hostPeerId);
      this.hostConnection = this.peer.connect(hostPeerId, {
        reliable: true
      });

      this.setupConnection(this.hostConnection);

      this.hostConnection.on('open', () => {
        console.log('Connected to host');
        resolve({ hostId: hostPeerId });
      });

      this.hostConnection.on('error', (error) => {
        console.error('Connection error:', error);
        reject(new Error('Failed to connect to host. Check the room code.'));
      });

      // Add timeout for connection
      setTimeout(() => {
        if (!this.hostConnection || !this.hostConnection.open) {
          reject(new Error('Connection timeout. Host may be offline.'));
        }
      }, 10000); // 10 second timeout
    });
  }

  // Setup connection event handlers
  setupConnection(conn) {
    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);

      if (this.isHost) {
        // Host: add to connections map
        this.connections.set(conn.peer, conn);

        // Notify game that a player joined
        if (this.onPlayerJoinedCallback) {
          this.onPlayerJoinedCallback(conn.peer);
        }
      }
    });

    conn.on('data', (data) => {
      this.handleData(conn.peer, data);
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);

      if (this.isHost) {
        this.connections.delete(conn.peer);

        // Notify game that a player left
        if (this.onPlayerLeftCallback) {
          this.onPlayerLeftCallback(conn.peer);
        }
      }
    });

    conn.on('error', (error) => {
      console.error('Connection error with', conn.peer, error);
    });
  }

  // Handle incoming data
  handleData(fromPeerId, data) {
    switch (data.type) {
      case 'init':
        // Client receives initial game state
        if (this.onInitCallback) {
          this.onInitCallback(data.payload);
        }
        break;

      case 'gameState':
        // Client receives game state update
        if (this.onGameStateCallback) {
          this.onGameStateCallback(data.payload);
        }
        break;

      case 'input':
        // Host receives player input
        if (this.onInputCallback) {
          this.onInputCallback(fromPeerId, data.payload);
        }
        break;

      case 'playerJoined':
        // Client receives notification of new player
        if (this.onPlayerJoinedCallback) {
          this.onPlayerJoinedCallback(data.payload);
        }
        break;

      case 'playerLeft':
        // Client receives notification of player leaving
        if (this.onPlayerLeftCallback) {
          this.onPlayerLeftCallback(data.payload);
        }
        break;
    }
  }

  // Send data (host to all clients or client to host)
  send(type, payload) {
    const data = { type, payload };

    if (this.isHost) {
      // Host: broadcast to all clients
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.send(data);
        }
      });
    } else {
      // Client: send to host
      if (this.hostConnection && this.hostConnection.open) {
        this.hostConnection.send(data);
      }
    }
  }

  // Send data to specific peer (host only)
  sendToPeer(peerId, type, payload) {
    if (!this.isHost) return;

    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send({ type, payload });
    }
  }

  // Leave room and cleanup
  leaveRoom() {
    // Close all connections
    if (this.isHost) {
      this.connections.forEach((conn) => conn.close());
      this.connections.clear();
    } else if (this.hostConnection) {
      this.hostConnection.close();
      this.hostConnection = null;
    }

    this.isHost = false;
  }

  // Cleanup
  destroy() {
    this.leaveRoom();

    if (this.peer) {
      this.peer.destroy();
    }
  }

  // Set callbacks
  onPlayerJoined(callback) {
    this.onPlayerJoinedCallback = callback;
  }

  onPlayerLeft(callback) {
    this.onPlayerLeftCallback = callback;
  }

  onGameState(callback) {
    this.onGameStateCallback = callback;
  }

  onInput(callback) {
    this.onInputCallback = callback;
  }

  onInit(callback) {
    this.onInitCallback = callback;
  }
}
