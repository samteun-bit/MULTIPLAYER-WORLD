// Client game logic - receives state from host and sends input
class GameClient {
  constructor(network) {
    this.network = network;
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
      onPlayerLeft: null
    };

    this.setupNetworking();
    this.startLocalUpdate();
  }

  setupNetworking() {
    this.network.onData((peerId, data) => {
      console.log('📦 CLIENT: Received data:', data.type, data);
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
              isGrounded: true
            };
          }

          console.log('📋 CLIENT: Players from init:', this.players);
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

          // Server reconciliation: gently correct local player position
          const serverPlayer = data.players.find(p => p.id === this.localPlayerId);
          if (serverPlayer && this.localPlayer) {
            // Soft correction with lerp to avoid jitter
            const correctionFactor = 0.1;
            this.localPlayer.position.x += (serverPlayer.position.x - this.localPlayer.position.x) * correctionFactor;
            this.localPlayer.position.y += (serverPlayer.position.y - this.localPlayer.position.y) * correctionFactor;
            this.localPlayer.position.z += (serverPlayer.position.z - this.localPlayer.position.z) * correctionFactor;
          }

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
      }
    });
  }

  sendInput(input) {
    // Store input for client-side prediction
    this.lastInput = input;

    // Send to server
    this.network.send({
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

    // Apply movement
    this.localPlayer.velocity.x = rotatedX * this.config.moveSpeed;
    this.localPlayer.velocity.z = rotatedZ * this.config.moveSpeed;

    // Jump
    if (input.jump && this.localPlayer.isGrounded) {
      this.localPlayer.velocity.y = this.config.jumpPower;
      this.localPlayer.isGrounded = false;
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
}
