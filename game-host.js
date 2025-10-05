// Host game logic - runs game simulation and broadcasts state to clients
class GameHost {
  constructor(network) {
    this.network = network;

    // Game state
    this.players = new Map(); // peerId -> player data
    this.inputs = new Map(); // peerId -> current inputs

    // Game configuration
    this.config = {
      moveSpeed: 5,
      jumpPower: 8,
      gravity: 20,
      groundLevel: 0.5,
      playerSize: 1,
      worldSize: 50
    };

    // Game loop
    this.lastUpdateTime = Date.now();
    this.gameLoopInterval = null;

    this.setupNetworkHandlers();
  }

  setupNetworkHandlers() {
    // Handle new player joining
    this.network.onPlayerJoined((peerId) => {
      console.log('Host: Player joined', peerId);
      this.addPlayer(peerId);
    });

    // Handle player leaving
    this.network.onPlayerLeft((peerId) => {
      console.log('Host: Player left', peerId);
      this.removePlayer(peerId);
    });

    // Handle player input
    this.network.onInput((peerId, inputData) => {
      const playerInputs = this.inputs.get(peerId);
      if (playerInputs) {
        Object.assign(playerInputs, inputData);
      }
    });
  }

  // Start hosting
  start() {
    // Add host player
    this.addPlayer(this.network.peerId);

    // Start game loop
    const TICK_RATE = 30;
    const TICK_INTERVAL = 1000 / TICK_RATE;

    this.gameLoopInterval = setInterval(() => {
      this.update();
    }, TICK_INTERVAL);

    console.log('Host: Game loop started');

    // Return initial game state
    return {
      config: this.config,
      players: Array.from(this.players.values()),
      localPlayerId: this.network.peerId
    };
  }

  // Add new player
  addPlayer(peerId) {
    const newPlayer = {
      id: peerId,
      position: { x: 0, y: this.config.groundLevel, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: 0,
      color: this.getRandomColor(),
      isGrounded: true
    };

    this.players.set(peerId, newPlayer);
    this.inputs.set(peerId, {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      cameraYaw: 0
    });

    // Send init data to the new player (if not host)
    if (peerId !== this.network.peerId) {
      this.network.sendToPeer(peerId, 'init', {
        config: this.config,
        players: Array.from(this.players.values()),
        localPlayerId: peerId
      });

      // Notify all other clients about the new player
      this.network.send('playerJoined', newPlayer);
    }

    return newPlayer;
  }

  // Remove player
  removePlayer(peerId) {
    this.players.delete(peerId);
    this.inputs.delete(peerId);

    // Notify all clients
    this.network.send('playerLeft', peerId);
  }

  // Update local player input (host's own input)
  updateLocalInput(inputData) {
    const localInputs = this.inputs.get(this.network.peerId);
    if (localInputs) {
      Object.assign(localInputs, inputData);
    }
  }

  // Game update loop
  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // Update all players
    this.players.forEach((player, peerId) => {
      const input = this.inputs.get(peerId);
      if (!input) return;

      // Calculate movement direction (local space)
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

      // Rotate movement direction based on camera yaw
      const cameraYaw = input.cameraYaw || 0;
      const rotatedX = moveX * Math.cos(-cameraYaw) - moveZ * Math.sin(-cameraYaw);
      const rotatedZ = moveX * Math.sin(-cameraYaw) + moveZ * Math.cos(-cameraYaw);

      // Apply movement
      player.velocity.x = rotatedX * this.config.moveSpeed;
      player.velocity.z = rotatedZ * this.config.moveSpeed;

      // Handle jumping
      if (input.jump && player.isGrounded) {
        player.velocity.y = this.config.jumpPower;
        player.isGrounded = false;
      }

      // Apply gravity
      if (!player.isGrounded) {
        player.velocity.y -= this.config.gravity * deltaTime;
      }

      // Update position
      player.position.x += player.velocity.x * deltaTime;
      player.position.y += player.velocity.y * deltaTime;
      player.position.z += player.velocity.z * deltaTime;

      // Ground collision
      if (player.position.y <= this.config.groundLevel) {
        player.position.y = this.config.groundLevel;
        player.velocity.y = 0;
        player.isGrounded = true;
      }

      // World boundaries
      const halfWorld = this.config.worldSize / 2;
      player.position.x = Math.max(-halfWorld, Math.min(halfWorld, player.position.x));
      player.position.z = Math.max(-halfWorld, Math.min(halfWorld, player.position.z));

      // Update rotation based on movement
      if (rotatedX !== 0 || rotatedZ !== 0) {
        player.rotation = Math.atan2(rotatedX, rotatedZ);
      }
    });

    // Broadcast game state to all clients
    const gameState = Array.from(this.players.values()).map(player => ({
      id: player.id,
      position: player.position,
      rotation: player.rotation,
      color: player.color
    }));

    this.network.send('gameState', gameState);
  }

  // Stop hosting
  stop() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }

    this.players.clear();
    this.inputs.clear();
  }

  // Get current game state for rendering
  getGameState() {
    return Array.from(this.players.values());
  }

  // Helper function
  getRandomColor() {
    const colors = [
      0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff,
      0x00ffff, 0xff8800, 0x8800ff, 0x00ff88, 0xff0088
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
