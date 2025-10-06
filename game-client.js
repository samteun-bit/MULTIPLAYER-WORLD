// Client game logic - receives state from host and sends input
class GameClient {
  constructor(network, playerName = 'Player') {
    this.network = network;
    this.playerName = playerName;
    this.players = [];
    this.localPlayerId = null;
    this.config = null;

    // Client-side prediction
    this.localPlayer = null;
    this.lastUpdateTime = Date.now();

    // Callbacks
    this.callbacks = {
      onInit: null,
      onGameState: null,
      onPlayerJoined: null,
      onPlayerLeft: null,
      onChatMessage: null,
      onShoot: null
    };

    this.setupNetworking();
    this.startLocalUpdate();
  }

  setupNetworking() {
    this.network.onData((peerId, data) => {
      // Only log non-gameState messages
      if (data.type !== 'gameState') {
        console.log('📦 CLIENT: Received data:', data.type, data);
      }
      switch (data.type) {
        case 'init':
          console.log('🎮 CLIENT: Received init data', data);
          this.localPlayerId = data.localPlayerId;
          this.config = data.config;
          this.players = data.players;

          // Initialize local player state for prediction
          const myPlayer = data.players.find(p => p.id === this.localPlayerId);
          if (myPlayer) {
            this.localPlayer = {
              position: { ...myPlayer.position },
              velocity: { x: 0, y: 0, z: 0 },
              rotation: myPlayer.rotation,
              isGrounded: true,
              jumpCount: 0,
              isDashing: false,
              dashTimer: 0,
              dashCooldownTimer: 0,
              dashStacks: 3,
              dashDirection: { x: 0, z: 0 }
            };
            this.lastInput = {
              forward: false,
              backward: false,
              left: false,
              right: false,
              jump: false,
              jumpPressed: false,
              dash: false,
              cameraYaw: 0
            };
            console.log('✅ CLIENT: Local player state initialized for prediction', this.localPlayer);
          } else {
            console.error('❌ CLIENT: Could not find my player in init data!');
          }

          console.log('📋 CLIENT: Players from init:', this.players);

          // Send player name to host
          this.network.sendToHost({
            type: 'playerInfo',
            name: this.playerName
          });

          if (this.callbacks.onInit) {
            console.log('✅ CLIENT: Calling onInit callback');
            this.callbacks.onInit({
              localPlayerId: data.localPlayerId,
              config: data.config,
              players: data.players
            });
          } else {
            console.log('❌ CLIENT: No onInit callback set!');
          }
          break;

        case 'gameState':
          this.players = data.players;

          // No server reconciliation - client is fully independent

          if (this.callbacks.onGameState) {
            this.callbacks.onGameState(data.players);
          }
          break;

        case 'playerJoined':
          console.log('🎮 CLIENT: Player joined:', data.player.id);
          if (this.callbacks.onPlayerJoined) {
            this.callbacks.onPlayerJoined(data.player);
          }
          break;

        case 'playerLeft':
          console.log('🎮 CLIENT: Player left:', data.playerId);
          if (this.callbacks.onPlayerLeft) {
            this.callbacks.onPlayerLeft(data.playerId);
          }
          break;

        case 'chat':
          console.log('💬 CLIENT: Received chat from', data.playerId, ':', data.message);
          if (this.callbacks.onChatMessage) {
            this.callbacks.onChatMessage(data);
          }
          break;

        case 'shoot':
          console.log('🔫 CLIENT: Received shoot from', data.playerId);
          if (this.callbacks.onShoot) {
            this.callbacks.onShoot(data);
          }
          break;
      }
    });
  }

  sendInput(input) {
    // Store input for client-side prediction
    this.lastInput = input;

    // Send to host (P2P)
    console.log('📤 CLIENT: Sending input to host:', input);
    this.network.sendToHost({
      type: 'input',
      input: input
    });
  }

  startLocalUpdate() {
    // Update local player at 60 FPS for smooth prediction
    this.lastUpdateTime = Date.now();
    setInterval(() => {
      if (this.lastInput && this.localPlayer && this.config) {
        const now = Date.now();
        const dt = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        this.updateLocalPlayer(this.lastInput, dt);
      }
    }, 1000 / 60);
  }

  updateLocalPlayer(input, dt) {
    // Update dash cooldown and stacks
    if (this.localPlayer.dashCooldownTimer > 0) {
      this.localPlayer.dashCooldownTimer -= dt;
      if (this.localPlayer.dashCooldownTimer <= 0) {
        this.localPlayer.dashCooldownTimer = 0;
        // Gain a stack when cooldown finishes
        if (this.localPlayer.dashStacks < this.config.maxDashStacks) {
          this.localPlayer.dashStacks++;
          // Start next cooldown if not at max stacks
          if (this.localPlayer.dashStacks < this.config.maxDashStacks) {
            this.localPlayer.dashCooldownTimer = this.config.dashCooldown;
          }
        }
      }
    }

    // Update dash timer
    if (this.localPlayer.isDashing) {
      this.localPlayer.dashTimer -= dt;
      if (this.localPlayer.dashTimer <= 0) {
        this.localPlayer.isDashing = false;
      }
    }

    // Same physics as server
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
    if (input.dash && !this.localPlayer.isDashing && this.localPlayer.dashStacks > 0 && (rotatedX !== 0 || rotatedZ !== 0)) {
      this.localPlayer.isDashing = true;
      this.localPlayer.dashTimer = this.config.dashDuration;
      this.localPlayer.dashStacks--;
      this.localPlayer.dashDirection.x = rotatedX;
      this.localPlayer.dashDirection.z = rotatedZ;

      // Start cooldown if not already running
      if (this.localPlayer.dashCooldownTimer <= 0) {
        this.localPlayer.dashCooldownTimer = this.config.dashCooldown;
      }
    }

    // Apply movement
    if (this.localPlayer.isDashing) {
      this.localPlayer.velocity.x = this.localPlayer.dashDirection.x * this.config.dashSpeed;
      this.localPlayer.velocity.z = this.localPlayer.dashDirection.z * this.config.dashSpeed;
    } else {
      this.localPlayer.velocity.x = rotatedX * this.config.moveSpeed;
      this.localPlayer.velocity.z = rotatedZ * this.config.moveSpeed;
    }

    // Double Jump - trigger on key press (not hold)
    if (input.jump && !input.jumpPressed) {
      if (this.localPlayer.isGrounded) {
        this.localPlayer.velocity.y = this.config.jumpPower;
        this.localPlayer.isGrounded = false;
        this.localPlayer.jumpCount = 1;
        input.jumpPressed = true;
      } else if (this.localPlayer.jumpCount === 1) {
        this.localPlayer.velocity.y = this.config.jumpPower;
        this.localPlayer.jumpCount = 2;
        input.jumpPressed = true;
      }
    } else if (!input.jump) {
      input.jumpPressed = false;
    }

    // Gravity
    if (!this.localPlayer.isGrounded) {
      this.localPlayer.velocity.y -= this.config.gravity * dt;
    }

    // Update position
    this.localPlayer.position.x += this.localPlayer.velocity.x * dt;
    this.localPlayer.position.y += this.localPlayer.velocity.y * dt;
    this.localPlayer.position.z += this.localPlayer.velocity.z * dt;

    // Ground collision
    if (this.localPlayer.position.y <= this.config.groundLevel) {
      this.localPlayer.position.y = this.config.groundLevel;
      this.localPlayer.velocity.y = 0;
      this.localPlayer.isGrounded = true;
      this.localPlayer.jumpCount = 0;
    }

    // World boundaries
    const half = this.config.worldSize / 2;
    this.localPlayer.position.x = Math.max(-half, Math.min(half, this.localPlayer.position.x));
    this.localPlayer.position.z = Math.max(-half, Math.min(half, this.localPlayer.position.z));

    // Update rotation
    if (rotatedX !== 0 || rotatedZ !== 0) {
      this.localPlayer.rotation = Math.atan2(rotatedX, rotatedZ);
    }
  }

  getLocalPlayerState() {
    return this.localPlayer;
  }

  // Set callbacks
  onInit(callback) {
    this.callbacks.onInit = callback;
  }

  onGameState(callback) {
    this.callbacks.onGameState = callback;
  }

  onPlayerJoined(callback) {
    this.callbacks.onPlayerJoined = callback;
  }

  onPlayerLeft(callback) {
    this.callbacks.onPlayerLeft = callback;
  }

  onChatMessage(callback) {
    this.callbacks.onChatMessage = callback;
  }

  sendChatMessage(chatData) {
    // Send chat message to host
    this.network.sendToHost({
      type: 'chat',
      playerId: chatData.playerId,
      message: chatData.message,
      timestamp: chatData.timestamp
    });
  }

  onShoot(callback) {
    this.callbacks.onShoot = callback;
  }

  sendShoot(startPos, direction) {
    // Send shoot event to host
    this.network.sendToHost({
      type: 'shoot',
      playerId: this.localPlayerId,
      startPos: { x: startPos.x, y: startPos.y, z: startPos.z },
      direction: { x: direction.x, y: direction.y, z: direction.z }
    });
  }
}
