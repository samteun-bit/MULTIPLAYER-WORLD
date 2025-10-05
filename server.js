const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Room management
const rooms = new Map(); // roomId -> { hostId, players: Set<socketId> }

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  // Create a new room
  socket.on('createRoom', (data, callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      hostId: socket.id,
      players: new Set([socket.id])
    });

    socket.join(roomId);
    console.log(`🏠 Room created: ${roomId} by ${socket.id}`);
    callback({ success: true, roomId });
  });

  // Join an existing room
  socket.on('joinRoom', (data, callback) => {
    const { roomId } = data;
    const room = rooms.get(roomId);

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    room.players.add(socket.id);
    socket.join(roomId);
    console.log(`✅ Player ${socket.id} joined room ${roomId}`);

    // Notify host that player joined
    socket.to(room.hostId).emit('playerJoined', { peerId: socket.id });

    callback({ success: true });
  });

  // Broadcast data to all players in room
  socket.on('broadcast', (data) => {
    const { roomId, payload } = data;
    const room = rooms.get(roomId);
    if (!room) return;

    // Send to all other players in room
    socket.to(roomId).emit('gameData', {
      from: socket.id,
      type: payload.type,
      payload: payload
    });
  });

  // Send data to specific peer
  socket.on('sendToPeer', (data) => {
    const { peerId, payload } = data;

    console.log(`📤 Sending from ${socket.id} to ${peerId}:`, payload.type);
    io.to(peerId).emit('gameData', {
      from: socket.id,
      type: payload.type,
      payload: payload
    });
  });

  // Leave room
  socket.on('leaveRoom', (data) => {
    const { roomId } = data;
    handleLeaveRoom(socket, roomId);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);

    // Find and leave all rooms
    rooms.forEach((room, roomId) => {
      if (room.players.has(socket.id)) {
        handleLeaveRoom(socket, roomId);
      }
    });
  });
});

function handleLeaveRoom(socket, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players.delete(socket.id);

  // If host left, close the room
  if (socket.id === room.hostId) {
    socket.to(roomId).emit('roomClosed', { roomId });
    rooms.delete(roomId);
    console.log(`🏠 Room ${roomId} closed (host left)`);
  } else {
    // Notify host that player left
    socket.to(room.hostId).emit('playerLeft', { peerId: socket.id });
    console.log(`👋 Player ${socket.id} left room ${roomId}`);
  }

  // Delete empty rooms
  if (room.players.size === 0) {
    rooms.delete(roomId);
  }
}

// Helper function to generate room IDs
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
