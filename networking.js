// Simple Socket.IO based networking
class NetworkManager {
  constructor() {
    this.socket = null;
    this.peerId = null;
    this.isHost = false;
    this.roomId = null;

    // Event handlers
    this.handlers = {
      onConnect: null,
      onDisconnect: null,
      onData: null
    };
  }

  // Initialize Socket.IO connection
  async init() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket.IO connection timeout'));
      }, 10000);

      // Connect to server (automatically uses current host in production)
      this.socket = io();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.peerId = this.socket.id;
        console.log('✅ Socket.IO connected:', this.peerId);
        resolve(this.peerId);
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.error('❌ Socket.IO connection error:', error);
        reject(error);
      });

      // Handle player joined
      this.socket.on('playerJoined', (data) => {
        console.log('📥 Player joined:', data.peerId);
        if (this.handlers.onConnect) {
          this.handlers.onConnect(data.peerId);
        }
      });

      // Handle player left
      this.socket.on('playerLeft', (data) => {
        console.log('📥 Player left:', data.peerId);
        if (this.handlers.onDisconnect) {
          this.handlers.onDisconnect(data.peerId);
        }
      });

      // Handle data from other players
      this.socket.on('gameData', (data) => {
        // Only log non-gameState messages to reduce spam
        if (data.type !== 'gameState') {
          console.log('📦 Received data from', data.from, ':', data.type);
        }
        if (this.handlers.onData) {
          this.handlers.onData(data.from, data.payload);
        }
      });
    });
  }

  // Create room (become host)
  createRoom() {
    return new Promise((resolve) => {
      this.socket.emit('createRoom', {}, (response) => {
        if (response.success) {
          this.isHost = true;
          this.roomId = response.roomId;
          console.log('🏠 Room created:', this.roomId);
          resolve(this.roomId);
        } else {
          console.error('Failed to create room:', response.error);
          resolve(null);
        }
      });
    });
  }

  // Join room (become client)
  async joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      console.log('🔗 Joining room:', roomId);

      this.socket.emit('joinRoom', { roomId }, (response) => {
        if (response.success) {
          this.isHost = false;
          this.roomId = roomId;
          console.log('✅ Joined room successfully!');
          resolve();
        } else {
          console.error('❌ Failed to join room:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  // Send data
  send(data) {
    if (!this.roomId) {
      console.error('❌ Not in a room');
      return;
    }

    // Only log non-gameState messages to reduce spam
    if (data.type !== 'gameState') {
      console.log('📤 Broadcasting:', data.type);
    }

    this.socket.emit('broadcast', {
      roomId: this.roomId,
      payload: data
    });
  }

  // Send to specific peer (host only)
  sendTo(peerId, data) {
    if (!this.isHost) {
      console.log('⚠️ sendTo called but not host');
      return;
    }

    // Only log non-input/non-gameState messages
    if (data.type !== 'input' && data.type !== 'gameState') {
      console.log('📤 Sending to', peerId, ':', data.type);
    }

    this.socket.emit('sendToPeer', {
      roomId: this.roomId,
      peerId: peerId,
      payload: data
    });
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
    if (this.socket) {
      if (this.roomId) {
        this.socket.emit('leaveRoom', { roomId: this.roomId });
      }
      this.socket.disconnect();
    }
  }
}
