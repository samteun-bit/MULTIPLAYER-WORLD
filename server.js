const express = require('express');
const http = require('http');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Create PeerJS server for WebRTC signaling
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});

app.use('/peerjs', peerServer);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Room management
const rooms = new Map(); // roomId -> { hostId, players: Set<peerId> }

// Simple signaling for room management
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Client connected for signaling:', socket.id);

  // Create a new room
  socket.on('createRoom', (data, callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      hostId: data.peerId,
      hostName: data.playerName || 'Host',
      players: new Set([data.peerId]),
      maxPlayers: 8
    });

    console.log(`Room created: ${roomId} by ${data.peerId}`);
    callback({ success: true, roomId });
  });

  // Join an existing room
  socket.on('joinRoom', (data, callback) => {
    const { roomId, peerId, playerName } = data;
    const room = rooms.get(roomId);

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      callback({ success: false, error: 'Room is full' });
      return;
    }

    room.players.add(peerId);
    console.log(`Player ${peerId} joined room ${roomId}`);

    // Notify the host about new player
    io.emit('playerJoinedRoom', { roomId, peerId, playerName });

    callback({
      success: true,
      hostId: room.hostId,
      playerCount: room.players.size
    });
  });

  // Leave room
  socket.on('leaveRoom', (data) => {
    const { roomId, peerId } = data;
    const room = rooms.get(roomId);

    if (room) {
      room.players.delete(peerId);

      // If host left, close the room
      if (peerId === room.hostId) {
        io.emit('roomClosed', { roomId });
        rooms.delete(roomId);
        console.log(`Room ${roomId} closed (host left)`);
      } else {
        io.emit('playerLeftRoom', { roomId, peerId });
        console.log(`Player ${peerId} left room ${roomId}`);
      }

      // Delete empty rooms
      if (room.players.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  // Get room info
  socket.on('getRoomInfo', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (room) {
      callback({
        success: true,
        hostId: room.hostId,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers
      });
    } else {
      callback({ success: false, error: 'Room not found' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper function to generate room IDs
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`PeerJS server running on /peerjs`);
});
