// Client game logic - receives state from host and sends input
class GameClient {
  constructor(network) {
    this.network = network;
    this.players = [];
    this.localPlayerId = null;
    this.config = null;

    // Callbacks
    this.callbacks = {
      onInit: null,
      onGameState: null,
      onPlayerJoined: null,
      onPlayerLeft: null
    };

    this.setupNetworking();
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
    // Store input for potential client-side prediction
    this.lastInput = input;

    this.network.send({
      type: 'input',
      input: input
    });
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
