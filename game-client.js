// Client game logic - receives game state from host
class GameClient {
  constructor(network) {
    this.network = network;

    // Game state
    this.players = [];
    this.localPlayerId = null;
    this.config = null;

    // Input state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      cameraYaw: 0
    };

    this.setupNetworkHandlers();
  }

  setupNetworkHandlers() {
    // Receive initial game state from host
    this.network.onInit((data) => {
      console.log('Client: Received init', data);
      this.localPlayerId = data.localPlayerId;
      this.config = data.config;
      this.players = data.players;

      if (this.onInitCallback) {
        this.onInitCallback(data);
      }
    });

    // Receive game state updates
    this.network.onGameState((gameState) => {
      this.players = gameState;

      if (this.onGameStateCallback) {
        this.onGameStateCallback(gameState);
      }
    });

    // Receive player joined notification
    this.network.onPlayerJoined((player) => {
      console.log('Client: Player joined', player);

      if (this.onPlayerJoinedCallback) {
        this.onPlayerJoinedCallback(player);
      }
    });

    // Receive player left notification
    this.network.onPlayerLeft((playerId) => {
      console.log('Client: Player left', playerId);

      if (this.onPlayerLeftCallback) {
        this.onPlayerLeftCallback(playerId);
      }
    });
  }

  // Start client
  start() {
    console.log('Client: Started');
  }

  // Update input
  updateInput(inputData) {
    Object.assign(this.keys, inputData);

    // Send input to host
    this.network.send('input', this.keys);
  }

  // Get current game state for rendering
  getGameState() {
    return this.players;
  }

  // Set callbacks
  onInit(callback) {
    this.onInitCallback = callback;
  }

  onGameState(callback) {
    this.onGameStateCallback = callback;
  }

  onPlayerJoined(callback) {
    this.onPlayerJoinedCallback = callback;
  }

  onPlayerLeft(callback) {
    this.onPlayerLeftCallback = callback;
  }

  // Stop client
  stop() {
    this.players = [];
  }
}
