const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30; // Server updates at 30 FPS
const TICK_INTERVAL = 1000 / TICK_RATE;

// Game state
const players = new Map(); // socketId -> player data
const inputs = new Map(); // socketId -> current inputs

// Game configuration
const GAME_CONFIG = {
  moveSpeed: 5,
  jumpPower: 8,
  gravity: 20,
  groundLevel: 0.5,
  playerSize: 1,
  worldSize: 50
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create new player
  const newPlayer = {
    id: socket.id,
    position: { x: 0, y: GAME_CONFIG.groundLevel, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: 0,
    color: getRandomColor(),
    isGrounded: true
  };

  players.set(socket.id, newPlayer);
  inputs.set(socket.id, {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false
  });

  // Send current players to new player
  const currentPlayers = Array.from(players.values());
  socket.emit('init', {
    playerId: socket.id,
    players: currentPlayers,
    config: GAME_CONFIG
  });

  // Broadcast new player to all other players
  socket.broadcast.emit('playerJoined', newPlayer);

  // Handle player input
  socket.on('input', (inputData) => {
    const playerInputs = inputs.get(socket.id);
    if (playerInputs) {
      Object.assign(playerInputs, inputData);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    inputs.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

// Game loop - server-authoritative
let lastUpdateTime = Date.now();

setInterval(() => {
  const now = Date.now();
  const deltaTime = (now - lastUpdateTime) / 1000; // Convert to seconds
  lastUpdateTime = now;

  // Update all players
  players.forEach((player, socketId) => {
    const input = inputs.get(socketId);
    if (!input) return;

    // Calculate movement direction
    let moveX = 0;
    let moveZ = 0;

    if (input.forward) moveZ -= 1;
    if (input.backward) moveZ += 1;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;

    // Normalize diagonal movement
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (length > 0) {
      moveX /= length;
      moveZ /= length;
    }

    // Apply movement
    player.velocity.x = moveX * GAME_CONFIG.moveSpeed;
    player.velocity.z = moveZ * GAME_CONFIG.moveSpeed;

    // Handle jumping
    if (input.jump && player.isGrounded) {
      player.velocity.y = GAME_CONFIG.jumpPower;
      player.isGrounded = false;
    }

    // Apply gravity
    if (!player.isGrounded) {
      player.velocity.y -= GAME_CONFIG.gravity * deltaTime;
    }

    // Update position
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    player.position.z += player.velocity.z * deltaTime;

    // Ground collision
    if (player.position.y <= GAME_CONFIG.groundLevel) {
      player.position.y = GAME_CONFIG.groundLevel;
      player.velocity.y = 0;
      player.isGrounded = true;
    }

    // World boundaries
    const halfWorld = GAME_CONFIG.worldSize / 2;
    player.position.x = Math.max(-halfWorld, Math.min(halfWorld, player.position.x));
    player.position.z = Math.max(-halfWorld, Math.min(halfWorld, player.position.z));

    // Update rotation based on movement
    if (moveX !== 0 || moveZ !== 0) {
      player.rotation = Math.atan2(moveX, moveZ);
    }
  });

  // Broadcast updated state to all clients
  const gameState = Array.from(players.values()).map(player => ({
    id: player.id,
    position: player.position,
    rotation: player.rotation,
    color: player.color
  }));

  io.emit('gameState', gameState);
}, TICK_INTERVAL);

// Helper function to generate random player colors
function getRandomColor() {
  const colors = [
    0xff0000, // Red
    0x00ff00, // Green
    0x0000ff, // Blue
    0xffff00, // Yellow
    0xff00ff, // Magenta
    0x00ffff, // Cyan
    0xff8800, // Orange
    0x8800ff, // Purple
    0x00ff88, // Mint
    0xff0088  // Pink
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
