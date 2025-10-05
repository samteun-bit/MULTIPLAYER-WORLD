// UI Management - Separated from game logic
class UIManager {
  constructor() {
    // UI Elements
    this.loadingScreen = document.getElementById('loading-screen');
    this.statusIndicator = document.getElementById('status-indicator');
    this.statusText = document.getElementById('status-text');
    this.playerCount = document.getElementById('player-count');
    this.playerListContent = document.getElementById('player-list-content');
    this.controlsList = document.getElementById('controls-list');
    this.fpsCounter = document.getElementById('fps-counter');

    // State
    this.players = new Map();
    this.localPlayerId = null;

    // FPS tracking
    this.frameCount = 0;
    this.lastFpsUpdate = Date.now();

    // Initialize
    this.initializeControls();
  }

  // Initialize controls display
  initializeControls() {
    CONFIG.controls.keys.forEach(control => {
      const controlItem = document.createElement('div');
      controlItem.className = 'control-item';
      controlItem.innerHTML = `
        <span class="control-key">${control.key}</span>
        <span class="control-action">${control.action}</span>
      `;
      this.controlsList.appendChild(controlItem);
    });
  }

  // Update connection status
  updateConnectionStatus(connected) {
    if (connected) {
      this.statusIndicator.classList.add('connected');
      this.statusText.textContent = 'Connected';
    } else {
      this.statusIndicator.classList.remove('connected');
      this.statusText.textContent = 'Connecting...';
    }
  }

  // Set local player ID
  setLocalPlayerId(playerId) {
    this.localPlayerId = playerId;
  }

  // Add or update player in list
  updatePlayer(player) {
    this.players.set(player.id, player);
    this.refreshPlayerList();
  }

  // Remove player from list
  removePlayer(playerId) {
    this.players.delete(playerId);
    this.refreshPlayerList();
  }

  // Refresh the entire player list display
  refreshPlayerList() {
    this.playerListContent.innerHTML = '';
    this.playerCount.textContent = this.players.size;

    // Sort players: local player first, then others
    const sortedPlayers = Array.from(this.players.values()).sort((a, b) => {
      if (a.id === this.localPlayerId) return -1;
      if (b.id === this.localPlayerId) return 1;
      return a.id.localeCompare(b.id);
    });

    sortedPlayers.forEach(player => {
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';

      const isLocalPlayer = player.id === this.localPlayerId;
      const playerName = isLocalPlayer ? 'You' : `Player ${player.id.substring(0, 6)}`;

      playerItem.innerHTML = `
        <div class="player-color" style="background-color: #${player.color.toString(16).padStart(6, '0')}"></div>
        <div class="player-name ${isLocalPlayer ? 'player-you' : ''}">${playerName}</div>
      `;

      this.playerListContent.appendChild(playerItem);
    });
  }

  // Update FPS counter
  updateFPS() {
    this.frameCount++;
    const now = Date.now();
    const elapsed = now - this.lastFpsUpdate;

    if (elapsed >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / elapsed);
      this.fpsCounter.textContent = `FPS: ${fps}`;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  // Hide loading screen
  hideLoadingScreen() {
    this.loadingScreen.classList.add('hidden');
  }

  // Show loading screen
  showLoadingScreen() {
    this.loadingScreen.classList.remove('hidden');
  }

  // Show disconnection message
  showDisconnected() {
    this.statusIndicator.classList.remove('connected');
    this.statusText.textContent = 'Disconnected';
  }

  // Show error message
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 20px 40px;
      border-radius: 8px;
      font-size: 18px;
      z-index: 1000;
      pointer-events: auto;
    `;
    errorDiv.textContent = message;
    document.getElementById('ui-overlay').appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}

// Create global UI manager instance
const ui = new UIManager();
