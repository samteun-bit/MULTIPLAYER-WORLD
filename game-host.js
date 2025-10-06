// Host game logic - runs the authoritative game simulation
class GameHost {
  constructor(network, hostName = 'Host') {
    this.network = network;
    this.hostName = hostName;
    this.players = new Map(); // peerId -> player state
    this.inputs = new Map(); // peerId -> current input

    // Game config
    this.config = {
      moveSpeed: 8,
      jumpPower: 8,
      gravity: 20,
      groundLevel: 0.5,
      worldSize: 50,
      dashSpeed: 25,
      dashDuration: 0.25,
      dashCooldown: 2.0,
      maxDashStacks: 3
    };

    this.lastUpdate = Date.now();
    this.updateInterval = null;

    // Callbacks for rendering
    this.onPlayerAddedCallback = null;
    this.onPlayerRemovedCallback = null;

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
      } else if (data.type === 'playerInfo') {
        // Update player name
        const player = this.players.get(peerId);
        if (player) {
          player.name = data.name;
          console.log('📝 Updated player name:', peerId, data.name);
        }
      } else if (data.type === 'chat') {
        // Broadcast chat message to all clients
        console.log('💬 HOST: Received chat from', peerId, ':', data.message);
        this.network.send({
          type: 'chat',
          playerId: data.playerId,
          message: data.message,
          timestamp: data.timestamp
        });
      }
    });
  }

  start() {
    console.log('🎮 HOST: Starting game');

    // Add host player
    this.addPlayer(this.network.peerId);

    // Start game loop at 20 Hz (20 updates/sec)
    // This reduces network load significantly
    this.updateInterval = setInterval(() => {
      this.update();
    }, 1000 / 20);

    console.log('🎮 HOST: Game loop running at 20 Hz (network updates)');

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
      name: peerId === this.network.peerId ? this.hostName : 'Player',
      position: { x: 0, y: this.config.groundLevel, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: 0,
      color: this.randomColor(),
      isGrounded: true,
      jumpCount: 0,
      isDashing: false,
      dashTimer: 0,
      dashCooldownTimer: 0,
      dashStacks: 3,
      dashDirection: { x: 0, z: 0 }
    };

    this.players.set(peerId, player);
    this.inputs.set(peerId, {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
      dash: false,
      cameraYaw: 0
    });

    console.log('📊 Total players now:', this.players.size);

    // Send initial state to the new player (if not host)
    if (peerId !== this.network.peerId) {
      const playersList = Array.from(this.players.values());
      const initData = {
        type: 'init',
        localPlayerId: peerId,
        config: this.config,
        players: playersList
      };
      console.log('📤 HOST: Sending init data to', peerId);
      console.log('📊 HOST: Current players in init:', playersList.map(p => p.id));
      console.log('📦 HOST: Full init data:', initData);
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

  // Set callbacks for when players are added/removed
  onPlayerAdded(callback) {
    this.onPlayerAddedCallback = callback;
  }

  onPlayerRemoved(callback) {
    this.onPlayerRemovedCallback = callback;
  }

  removePlayer(peerId) {
    console.log('🗑️ HOST: Removing player:', peerId);
    console.log('📊 HOST: Players before removal:', Array.from(this.players.keys()));

    this.players.delete(peerId);
    this.inputs.delete(peerId);

    console.log('📊 HOST: Players after removal:', Array.from(this.players.keys()));

    // Notify client.js for rendering cleanup
    if (this.onPlayerRemovedCallback) {
      console.log('🎨 Calling render cleanup callback for player:', peerId);
      this.onPlayerRemovedCallback(peerId);
    }

    // Broadcast to all clients (including self as host)
    const removeMessage = {
      type: 'playerLeft',
      playerId: peerId
    };

    console.log('📢 HOST: Broadcasting player removal:', removeMessage);
    this.network.send(removeMessage);
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

      // Update dash cooldown and stacks
      if (player.dashCooldownTimer > 0) {
        player.dashCooldownTimer -= dt;
        if (player.dashCooldownTimer <= 0) {
          player.dashCooldownTimer = 0;
          // Gain a stack when cooldown finishes
          if (player.dashStacks < this.config.maxDashStacks) {
            player.dashStacks++;
            // Start next cooldown if not at max stacks
            if (player.dashStacks < this.config.maxDashStacks) {
              player.dashCooldownTimer = this.config.dashCooldown;
            }
          }
        }
      }

      // Update dash timer
      if (player.isDashing) {
        player.dashTimer -= dt;
        if (player.dashTimer <= 0) {
          player.isDashing = false;
        }
      }

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

      // Dash - consume stack
      if (input.dash && !player.isDashing && player.dashStacks > 0 && (rotatedX !== 0 || rotatedZ !== 0)) {
        player.isDashing = true;
        player.dashTimer = this.config.dashDuration;
        player.dashStacks--;
        player.dashDirection.x = rotatedX;
        player.dashDirection.z = rotatedZ;

        // Start cooldown if not already running
        if (player.dashCooldownTimer <= 0) {
          player.dashCooldownTimer = this.config.dashCooldown;
        }
      }

      // Apply movement
      if (player.isDashing) {
        player.velocity.x = player.dashDirection.x * this.config.dashSpeed;
        player.velocity.z = player.dashDirection.z * this.config.dashSpeed;
      } else {
        player.velocity.x = rotatedX * this.config.moveSpeed;
        player.velocity.z = rotatedZ * this.config.moveSpeed;
      }

      // Double Jump - trigger on key press (not hold)
      if (input.jump && !input.jumpPressed) {
        if (player.isGrounded) {
          player.velocity.y = this.config.jumpPower;
          player.isGrounded = false;
          player.jumpCount = 1;
          input.jumpPressed = true;
        } else if (player.jumpCount === 1) {
          player.velocity.y = this.config.jumpPower;
          player.jumpCount = 2;
          input.jumpPressed = true;
        }
      } else if (!input.jump) {
        input.jumpPressed = false;
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
        player.jumpCount = 0;
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
        name: p.name,
        position: p.position,
        rotation: p.rotation,
        color: p.color,
        dashCooldownTimer: p.dashCooldownTimer,
        dashStacks: p.dashStacks
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

  broadcastChatMessage(chatData) {
    // Host broadcasts their own chat message to all clients
    console.log('💬 HOST: Broadcasting own chat:', chatData.message);
    this.network.send({
      type: 'chat',
      playerId: chatData.playerId,
      message: chatData.message,
      timestamp: chatData.timestamp
    });
  }
}
