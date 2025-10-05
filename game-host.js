// Host game logic - runs the authoritative game simulation
class GameHost {
  constructor(network) {
    this.network = network;
    this.players = new Map(); // peerId -> player state
    this.inputs = new Map(); // peerId -> current input

    // Game config
    this.config = {
      moveSpeed: 5,
      jumpPower: 8,
      gravity: 20,
      groundLevel: 0.5,
      worldSize: 50
    };

    this.lastUpdate = Date.now();
    this.updateInterval = null;

    // Callback for rendering
    this.onPlayerAddedCallback = null;

    this.setupNetworking();
  }

  setupNetworking() {
    // When a client connects
    this.network.onConnect((peerId) => {
      console.log('🎮 HOST: Player connected:', peerId);
      this.addPlayer(peerId);
    });

    // When a client disconnects
    this.network.onDisconnect((peerId) => {
      console.log('🎮 HOST: Player disconnected:', peerId);
      this.removePlayer(peerId);
    });

    // When receiving data from clients
    this.network.onData((peerId, data) => {
      if (data.type === 'input') {
        // Update player input
        const input = this.inputs.get(peerId);
        if (input) {
          Object.assign(input, data.input);
        }
      }
    });
  }

  start() {
    console.log('🎮 HOST: Starting game');

    // Add host player
    this.addPlayer(this.network.peerId);

    // Start game loop (60 FPS for smoother updates)
    this.updateInterval = setInterval(() => {
      this.update();
    }, 1000 / 60);

    console.log('🎮 HOST: Game loop running at 60 FPS');

    return {
      localPlayerId: this.network.peerId,
      config: this.config,
      players: Array.from(this.players.values())
    };
  }

  addPlayer(peerId) {
    console.log('➕ Adding player:', peerId);

    const player = {
      id: peerId,
      position: { x: 0, y: this.config.groundLevel, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: 0,
      color: this.randomColor(),
      isGrounded: true
    };

    this.players.set(peerId, player);
    this.inputs.set(peerId, {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      cameraYaw: 0
    });

    console.log('📊 Total players now:', this.players.size);

    // Send initial state to the new player (if not host)
    if (peerId !== this.network.peerId) {
      const initData = {
        type: 'init',
        localPlayerId: peerId,
        config: this.config,
        players: Array.from(this.players.values())
      };
      console.log('📤 HOST: Sending init data to', peerId, initData);
      this.network.sendTo(peerId, initData);

      // Broadcast to all clients that a new player joined
      const joinData = {
        type: 'playerJoined',
        player: player
      };
      console.log('📢 HOST: Broadcasting player joined:', joinData);
      this.network.send(joinData);
    }

    // Notify client.js for rendering
    if (this.onPlayerAddedCallback) {
      console.log('🎨 Calling render callback for player:', peerId);
      this.onPlayerAddedCallback(player);
    }

    return player;
  }

  // Set callback for when players are added
  onPlayerAdded(callback) {
    this.onPlayerAddedCallback = callback;
  }

  removePlayer(peerId) {
    this.players.delete(peerId);
    this.inputs.delete(peerId);

    // Broadcast to all clients
    this.network.send({
      type: 'playerLeft',
      playerId: peerId
    });
  }

  updateInput(inputData) {
    // Update host's own input
    const input = this.inputs.get(this.network.peerId);
    if (input) {
      Object.assign(input, inputData);
    }
  }

  update() {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    // Update all players
    this.players.forEach((player, peerId) => {
      const input = this.inputs.get(peerId);
      if (!input) return;

      // Calculate movement
      let moveX = 0;
      let moveZ = 0;

      if (input.forward) moveZ -= 1;
      if (input.backward) moveZ += 1;
      if (input.left) moveX -= 1;
      if (input.right) moveX += 1;

      // Normalize
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (length > 0) {
        moveX /= length;
        moveZ /= length;
      }

      // Rotate by camera yaw
      const yaw = input.cameraYaw || 0;
      const rotatedX = moveX * Math.cos(-yaw) - moveZ * Math.sin(-yaw);
      const rotatedZ = moveX * Math.sin(-yaw) + moveZ * Math.cos(-yaw);

      // Apply movement
      player.velocity.x = rotatedX * this.config.moveSpeed;
      player.velocity.z = rotatedZ * this.config.moveSpeed;

      // Jump
      if (input.jump && player.isGrounded) {
        player.velocity.y = this.config.jumpPower;
        player.isGrounded = false;
      }

      // Gravity
      if (!player.isGrounded) {
        player.velocity.y -= this.config.gravity * dt;
      }

      // Update position
      player.position.x += player.velocity.x * dt;
      player.position.y += player.velocity.y * dt;
      player.position.z += player.velocity.z * dt;

      // Ground collision
      if (player.position.y <= this.config.groundLevel) {
        player.position.y = this.config.groundLevel;
        player.velocity.y = 0;
        player.isGrounded = true;
      }

      // World boundaries
      const half = this.config.worldSize / 2;
      player.position.x = Math.max(-half, Math.min(half, player.position.x));
      player.position.z = Math.max(-half, Math.min(half, player.position.z));

      // Update rotation
      if (rotatedX !== 0 || rotatedZ !== 0) {
        player.rotation = Math.atan2(rotatedX, rotatedZ);
      }
    });

    // Broadcast game state
    this.network.send({
      type: 'gameState',
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        position: p.position,
        rotation: p.rotation,
        color: p.color
      }))
    });
  }

  getPlayers() {
    return Array.from(this.players.values());
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.players.clear();
    this.inputs.clear();
  }

  randomColor() {
    const colors = [
      0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff,
      0x00ffff, 0xff8800, 0x8800ff, 0x00ff88, 0xff0088
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
