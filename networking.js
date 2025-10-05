// WebRTC Networking Manager using PeerJS (Serverless)
class NetworkManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.roomId = null;
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

    // Firebase reference (will be initialized later)
    this.db = null;
    this.roomRef = null;
  }

  // Initialize PeerJS and Firebase
  async initialize() {
    return new Promise((resolve, reject) => {
      // Connect to PeerJS cloud server
      this.peer = new Peer({
        debug: 2,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('PeerJS connected with ID:', id);
        this.peerId = id;

        // Initialize Firebase
        this.initializeFirebase();

        resolve(id);
      });

      this.peer.on('error', (error) => {
        console.error('PeerJS error:', error);
        // Don't reject on all errors, some are recoverable
        if (error.type === 'unavailable-id' || error.type === 'network') {
          reject(error);
        }
      });

      // Handle incoming connections (for host)
      this.peer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer);
        this.setupConnection(conn);
      });
    });
  }

  // Initialize Firebase Realtime Database
  initializeFirebase() {
    // Firebase config - using a public demo database for simplicity
    // In production, you should create your own Firebase project
    const firebaseConfig = {
      apiKey: "AIzaSyDOCAbC123dEf456GhI789jKl01-MnO",
      databaseURL: "https://multiplayer-world-default-rtdb.firebaseio.com",
      projectId: "multiplayer-world"
    };

    // Initialize Firebase if not already initialized
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    this.db = firebase.database();
  }

  // Create a new room (become host)
  async createRoom(playerName = 'Host') {
    return new Promise(async (resolve, reject) => {
      try {
        this.roomId = this.generateRoomId();
        this.isHost = true;

        // Create room in Firebase
        this.roomRef = this.db.ref('rooms/' + this.roomId);
        await this.roomRef.set({
          hostId: this.peerId,
          hostName: playerName,
          createdAt: Date.now(),
          players: {
            [this.peerId]: {
              name: playerName,
              joinedAt: Date.now()
            }
          }
        });

        // Listen for players joining
        this.roomRef.child('players').on('child_added', (snapshot) => {
          const playerId = snapshot.key;
          if (playerId !== this.peerId) {
            console.log('Player joined room:', playerId);
          }
        });

        // Cleanup on disconnect
        this.roomRef.onDisconnect().remove();

        console.log('Room created:', this.roomId);
        resolve(this.roomId);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Join an existing room (become client)
  async joinRoom(roomId, playerName = 'Player') {
    return new Promise(async (resolve, reject) => {
      try {
        this.roomId = roomId.toUpperCase();
        this.isHost = false;

        // Check if room exists
        this.roomRef = this.db.ref('rooms/' + this.roomId);
        const snapshot = await this.roomRef.once('value');

        if (!snapshot.exists()) {
          reject(new Error('Room not found'));
          return;
        }

        const roomData = snapshot.val();
        const hostId = roomData.hostId;

        // Add self to room
        await this.roomRef.child('players/' + this.peerId).set({
          name: playerName,
          joinedAt: Date.now()
        });

        // Remove self on disconnect
        this.roomRef.child('players/' + this.peerId).onDisconnect().remove();

        // Connect to host via WebRTC
        console.log('Connecting to host:', hostId);
        this.hostConnection = this.peer.connect(hostId, {
          reliable: true
        });

        this.setupConnection(this.hostConnection);

        this.hostConnection.on('open', () => {
          console.log('Connected to host');
          resolve({ hostId });
        });

        this.hostConnection.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate room ID
  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
    // Remove from Firebase
    if (this.roomRef && this.peerId) {
      this.roomRef.child('players/' + this.peerId).remove();

      if (this.isHost) {
        // Remove entire room if host
        this.roomRef.remove();
      }
    }

    // Close all connections
    if (this.isHost) {
      this.connections.forEach((conn) => conn.close());
      this.connections.clear();
    } else if (this.hostConnection) {
      this.hostConnection.close();
      this.hostConnection = null;
    }

    this.roomId = null;
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
