// Main client application
class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Networking
    this.network = null;
    this.gameHost = null;
    this.gameClient = null;
    this.isHost = false;

    // Game state
    this.players = new Map(); // playerId -> THREE.Mesh
    this.localPlayerId = null;
    this.config = null;

    // Input
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      dash: false
    };

    // Camera
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.cameraRotation = { yaw: 0, pitch: 0 };

    this.init();
  }

  async init() {
    this.setupThreeJS();
    this.setupControls();
    this.setupUI();

    // Load saved name
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      document.getElementById('player-name-input').value = savedName;
    }

    try {
      this.network = new NetworkManager();
      await this.network.init();

      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('room-menu').style.display = 'block';
    } catch (error) {
      console.error('Failed to initialize:', error);
      alert('Failed to connect: ' + error.message);
    }
  }

  setupThreeJS() {
    const container = document.getElementById('game-container');

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.renderer.backgroundColor);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / window.innerHeight,
      CONFIG.camera.near,
      CONFIG.camera.far
    );
    this.camera.position.set(0, CONFIG.camera.offsetY, CONFIG.camera.offsetZ);

    // Renderer with shadow support
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Ground with shadow receiving
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(100, 20);
    this.scene.add(grid);

    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  setupControls() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Chat input setup
    const chatInput = document.getElementById('chat-input');
    const chatContainer = document.getElementById('chat-input-container');

    // Enter key to toggle chat
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        if (chatContainer.style.display === 'none' || !chatContainer.style.display) {
          // Show chat input
          chatContainer.style.display = 'block';
          chatInput.focus();
          e.preventDefault();
        }
      } else if (e.code === 'Escape' && chatContainer.style.display === 'block') {
        // Hide chat on Escape
        chatContainer.style.display = 'none';
        chatInput.value = '';
        chatInput.blur();
      }
    });

    // Send chat message
    chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
          this.sendChatMessage(message);
          chatInput.value = '';
        }
        chatContainer.style.display = 'none';
        chatInput.blur();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        chatContainer.style.display = 'none';
        chatInput.value = '';
        chatInput.blur();
      }
    });
  }

  setupUI() {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const btnBack = document.getElementById('btn-back');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnCopyCode = document.getElementById('btn-copy-code');

    btnHost.addEventListener('click', () => this.onHostClick());
    btnJoin.addEventListener('click', () => this.onJoinClick());
    btnBack.addEventListener('click', () => this.onBackClick());
    btnJoinRoom.addEventListener('click', () => this.onJoinRoomClick());
    btnStartGame.addEventListener('click', () => this.onStartGameClick());
    btnCopyCode.addEventListener('click', () => this.onCopyCodeClick());
  }

  async onHostClick() {
    try {
      // Get player name
      const playerName = document.getElementById('player-name-input').value.trim() || 'Player';
      localStorage.setItem('playerName', playerName);

      const roomId = await this.network.createRoom();
      document.getElementById('room-code').textContent = roomId;

      document.getElementById('btn-host').style.display = 'none';
      document.getElementById('btn-join').style.display = 'none';
      document.getElementById('player-name-input').style.display = 'none';
      document.getElementById('room-info').style.display = 'block';

      this.isHost = true;

      // Create game host IMMEDIATELY when hosting starts
      console.log('🎮 Creating GameHost immediately on host click');
      this.gameHost = new GameHost(this.network, playerName);

      // Set callbacks for when players are added/removed
      this.gameHost.onPlayerAdded((player) => {
        console.log('🎨 Rendering new player:', player.id);
        this.createPlayerMesh(player);
        ui.updatePlayer(player);
      });

      this.gameHost.onPlayerRemoved((peerId) => {
        console.log('🎨 Cleaning up removed player:', peerId);
        this.removePlayerMesh(peerId);
        ui.removePlayer(peerId);
      });

      this.gameHost.onChatMessage((chatData) => {
        console.log('💬 HOST: Chat message callback:', chatData);
        this.showChatBubble(chatData.playerId, chatData.message);
      });

      // Setup host-specific callbacks for rendering (polling backup)
      this.setupHostCallbacks();
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create room: ' + error.message);
    }
  }

  onJoinClick() {
    document.getElementById('btn-host').style.display = 'none';
    document.getElementById('btn-join').style.display = 'none';
    document.getElementById('join-room-form').style.display = 'block';
  }

  onBackClick() {
    document.getElementById('join-room-form').style.display = 'none';
    document.getElementById('btn-host').style.display = 'block';
    document.getElementById('btn-join').style.display = 'block';
    document.getElementById('room-id-input').value = '';
  }

  async onJoinRoomClick() {
    const hostPeerId = document.getElementById('room-id-input').value.trim();
    if (!hostPeerId) {
      alert('Please enter host Peer ID');
      return;
    }

    // Get player name
    const playerName = document.getElementById('player-name-input').value.trim() || 'Player';
    localStorage.setItem('playerName', playerName);

    try {
      document.getElementById('btn-join-room').disabled = true;
      document.getElementById('btn-join-room').textContent = 'Connecting...';

      // Setup client FIRST - before connecting
      console.log('🔧 Creating GameClient');
      this.gameClient = new GameClient(this.network, playerName);
      console.log('🔧 Setting up callbacks BEFORE connecting');
      this.setupClientCallbacks();

      console.log('🔗 Now connecting to host...');
      await this.network.joinRoom(hostPeerId);

      console.log('✅ Connection complete, hiding menu');
      document.getElementById('room-menu').style.display = 'none';
      ui.updateConnectionStatus(true);

    } catch (error) {
      console.error('Failed to join:', error);
      alert('Failed to join: ' + error.message);
      document.getElementById('btn-join-room').disabled = false;
      document.getElementById('btn-join-room').textContent = 'Join';
    }
  }

  onStartGameClick() {
    console.log('🎮 Starting game as host');

    if (!this.gameHost) {
      console.error('❌ GameHost not created! This should not happen.');
      return;
    }

    const initData = this.gameHost.start();

    this.localPlayerId = initData.localPlayerId;
    this.config = initData.config;
    ui.setLocalPlayerId(this.localPlayerId);

    document.getElementById('room-menu').style.display = 'none';
    ui.updateConnectionStatus(true);
  }

  setupHostCallbacks() {
    // DO NOT override network.onData here - GameHost already handles it
    // Just set up visual callbacks

    // Polling backup for syncing player names and detecting edge cases
    setInterval(() => {
      if (!this.gameHost) return;

      const players = this.gameHost.getPlayers();

      // Update player names if changed
      players.forEach(player => {
        const mesh = this.players.get(player.id);
        if (mesh && mesh.userData.playerName !== player.name) {
          this.updatePlayerNameTag(mesh, player.name);
          mesh.userData.playerName = player.name;
          ui.updatePlayer(player);
        }
      });
    }, 100);
  }

  setupClientCallbacks() {
    console.log('🔧 Setting up client callbacks');
    this.gameClient.onInit((data) => {
      console.log('🎮 Client initialized', data);
      this.localPlayerId = data.localPlayerId;
      this.config = data.config;

      ui.setLocalPlayerId(this.localPlayerId);
      console.log('👥 Creating player meshes for:', data.players.length, 'players');
      data.players.forEach(player => {
        console.log('Creating mesh for player:', player.id);
        this.createPlayerMesh(player);
        ui.updatePlayer(player);
      });
    });

    this.gameClient.onGameState((players) => {
      this.updateGameState(players);
    });

    this.gameClient.onPlayerJoined((player) => {
      this.createPlayerMesh(player);
      ui.updatePlayer(player);
    });

    this.gameClient.onPlayerLeft((playerId) => {
      console.log('🔌 CLIENT: onPlayerLeft triggered for:', playerId);
      this.removePlayerMesh(playerId);
      ui.removePlayer(playerId);
    });

    this.gameClient.onChatMessage((chatData) => {
      console.log('💬 CLIENT: Chat callback triggered:', chatData);
      // Don't show own messages again (already shown optimistically)
      if (chatData.playerId !== this.localPlayerId) {
        this.showChatBubble(chatData.playerId, chatData.message);
      }
    });
  }

  onCopyCodeClick() {
    const code = document.getElementById('room-code').textContent;
    navigator.clipboard.writeText(code);
    const btn = document.getElementById('btn-copy-code');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }

  onKeyDown(event) {
    // Don't process game input when chat is open
    const chatContainer = document.getElementById('chat-input-container');
    if (chatContainer && chatContainer.style.display === 'block') {
      return;
    }

    // C key to toggle controls panel
    if (event.code === 'KeyC') {
      const controlsPanel = document.getElementById('controls-panel');
      if (controlsPanel.style.display === 'none') {
        controlsPanel.style.display = 'block';
      } else {
        controlsPanel.style.display = 'none';
      }
      event.preventDefault();
      return;
    }

    let changed = false;

    switch (event.code) {
      case 'KeyW':
        this.keys.forward = true;
        changed = true;
        break;
      case 'KeyS':
        this.keys.backward = true;
        changed = true;
        break;
      case 'KeyA':
        this.keys.left = true;
        changed = true;
        break;
      case 'KeyD':
        this.keys.right = true;
        changed = true;
        break;
      case 'Space':
        this.keys.jump = true;
        changed = true;
        event.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.dash = true;
        changed = true;
        event.preventDefault();
        break;
      case 'KeyP':
        this.cameraRotation.yaw -= Math.PI / 2;
        changed = true;
        event.preventDefault();
        break;
      case 'KeyO':
        this.cameraRotation.yaw += Math.PI / 2;
        changed = true;
        event.preventDefault();
        break;
    }

    if (changed) {
      this.sendInput();
    }
  }

  onKeyUp(event) {
    // Don't process game input when chat is open
    const chatContainer = document.getElementById('chat-input-container');
    if (chatContainer && chatContainer.style.display === 'block') {
      return;
    }

    let changed = false;

    switch (event.code) {
      case 'KeyW':
        this.keys.forward = false;
        changed = true;
        break;
      case 'KeyS':
        this.keys.backward = false;
        changed = true;
        break;
      case 'KeyA':
        this.keys.left = false;
        changed = true;
        break;
      case 'KeyD':
        this.keys.right = false;
        changed = true;
        break;
      case 'Space':
        this.keys.jump = false;
        changed = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.dash = false;
        changed = true;
        break;
    }

    if (changed) {
      this.sendInput();
    }
  }

  sendInput() {
    const input = {
      ...this.keys,
      cameraYaw: this.cameraRotation.yaw
    };

    if (this.isHost && this.gameHost) {
      this.gameHost.updateInput(input);
    } else if (this.gameClient) {
      this.gameClient.sendInput(input);
    }
  }

  createPlayerMesh(playerData) {
    if (this.players.has(playerData.id)) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: playerData.color });
    const mesh = new THREE.Mesh(geometry, material);

    // Enable shadow casting
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Store player name in userData for tracking
    mesh.userData.playerName = playerData.name || 'Player';

    mesh.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );

    // Create name tag sprite (transparent background)
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    // Add text shadow for better visibility
    context.font = 'Bold 32px Arial';
    context.fillStyle = 'black';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Draw shadow (offset)
    context.fillText(mesh.userData.playerName, canvas.width / 2 + 2, canvas.height / 2 + 2);

    // Draw white text on top
    context.fillStyle = 'white';
    context.fillText(mesh.userData.playerName, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = 1.5;
    mesh.add(sprite);

    this.scene.add(mesh);
    this.players.set(playerData.id, mesh);

    console.log('✅ Created player mesh:', playerData.id, mesh.userData.playerName);
  }

  removePlayerMesh(playerId) {
    const mesh = this.players.get(playerId);
    if (mesh) {
      // Clean up sprite and texture
      const sprite = mesh.children.find(child => child instanceof THREE.Sprite);
      if (sprite) {
        if (sprite.material.map) {
          sprite.material.map.dispose();
        }
        sprite.material.dispose();
      }

      // Remove from scene
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.players.delete(playerId);

      console.log('🗑️ Removed player mesh:', playerId);
      console.log('📊 Remaining players:', this.players.size);
    } else {
      console.log('⚠️ Tried to remove non-existent player:', playerId);
    }
  }

  updateGameState(players) {
    // Create a set of player IDs from server state
    const serverPlayerIds = new Set(players.map(p => p.id));

    // Remove players that are no longer in server state
    this.players.forEach((mesh, playerId) => {
      if (!serverPlayerIds.has(playerId)) {
        console.log('🧹 Cleaning up disappeared player:', playerId);
        this.removePlayerMesh(playerId);
        ui.removePlayer(playerId);
      }
    });

    // Update existing players
    players.forEach(playerData => {
      const mesh = this.players.get(playerData.id);
      if (mesh) {
        // Update name tag if name changed
        if (mesh.userData.playerName !== playerData.name) {
          this.updatePlayerNameTag(mesh, playerData.name);
          mesh.userData.playerName = playerData.name;
          // Also update UI player list
          ui.updatePlayer(playerData);
        }

        // For local player: use client-side predicted position
        if (playerData.id === this.localPlayerId) {
          if (this.gameClient && this.gameClient.getLocalPlayerState) {
            const localState = this.gameClient.getLocalPlayerState();
            if (localState) {
              mesh.position.set(
                localState.position.x,
                localState.position.y,
                localState.position.z
              );
              mesh.rotation.y = localState.rotation;
              return;
            }
          }
          // Fallback to server state if prediction not available
          mesh.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
          );
          mesh.rotation.y = playerData.rotation;
          return;
        }

        // Smooth interpolation for remote players
        // Lower lerp = smoother, but slightly more delayed
        const lerpFactor = 0.2; // Reduced for smoother movement

        mesh.position.x += (playerData.position.x - mesh.position.x) * lerpFactor;
        mesh.position.y += (playerData.position.y - mesh.position.y) * lerpFactor;
        mesh.position.z += (playerData.position.z - mesh.position.z) * lerpFactor;

        // Smooth rotation with slower interpolation
        let targetRotation = playerData.rotation;
        let currentRotation = mesh.rotation.y;

        // Handle rotation wrapping
        let diff = targetRotation - currentRotation;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;

        // Use even slower rotation for smoothness
        mesh.rotation.y += diff * (lerpFactor * 0.8);
      }
    });
  }

  updatePlayerNameTag(mesh, newName) {
    // Find and remove old name tag sprite (but keep chat bubbles)
    const oldSprite = mesh.children.find(child => child instanceof THREE.Sprite && child.userData.isNameTag);
    if (oldSprite) {
      mesh.remove(oldSprite);
      oldSprite.material.map.dispose();
      oldSprite.material.dispose();
    }

    // Create new name tag
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    context.font = 'Bold 32px Arial';
    context.fillStyle = 'black';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(newName || 'Player', canvas.width / 2 + 2, canvas.height / 2 + 2);

    context.fillStyle = 'white';
    context.fillText(newName || 'Player', canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = 1.5;
    sprite.userData.isNameTag = true;
    mesh.add(sprite);
  }

  sendChatMessage(message) {
    const chatData = {
      playerId: this.localPlayerId,
      message: message,
      timestamp: Date.now()
    };

    // Send via network
    if (this.isHost && this.gameHost) {
      this.gameHost.broadcastChatMessage(chatData);
      // Show locally
      this.showChatBubble(this.localPlayerId, message);
    } else if (this.gameClient) {
      this.gameClient.sendChatMessage(chatData);
      // Show locally (optimistic)
      this.showChatBubble(this.localPlayerId, message);
    }
  }

  showChatBubble(playerId, message) {
    const mesh = this.players.get(playerId);
    if (!mesh) return;

    // Remove existing chat bubble if any
    const oldBubble = mesh.children.find(child => child.userData.isChatBubble);
    if (oldBubble) {
      mesh.remove(oldBubble);
      if (oldBubble.material.map) oldBubble.material.map.dispose();
      oldBubble.material.dispose();
    }

    // Create chat bubble canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Draw speech bubble background
    context.fillStyle = 'rgba(255, 255, 255, 0.95)';
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    context.lineWidth = 3;

    // Rounded rectangle
    const x = 20, y = 20, w = canvas.width - 40, h = canvas.height - 40, r = 15;
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
    context.fill();
    context.stroke();

    // Draw text
    context.font = 'Bold 28px Arial';
    context.fillStyle = 'black';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Word wrap
    const maxWidth = w - 20;
    const words = message.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      const metrics = context.measureText(testLine);
      if (metrics.width > maxWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    // Draw lines
    const lineHeight = 32;
    const startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, i) => {
      context.fillText(line, canvas.width / 2, startY + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4, 1, 1);
    sprite.position.y = 2.5;
    sprite.userData.isChatBubble = true;
    mesh.add(sprite);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (mesh.children.includes(sprite)) {
        mesh.remove(sprite);
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      }
    }, 5000);
  }

  updateCamera() {
    const localPlayer = this.players.get(this.localPlayerId);
    if (!localPlayer) return;

    const distance = CONFIG.camera.offsetZ;
    const height = CONFIG.camera.offsetY;

    const offsetX = distance * Math.sin(this.cameraRotation.yaw);
    const offsetZ = distance * Math.cos(this.cameraRotation.yaw);

    const desiredX = localPlayer.position.x + offsetX;
    const desiredY = localPlayer.position.y + height;
    const desiredZ = localPlayer.position.z + offsetZ;

    // Smooth camera movement - all axes use same smooth lerp
    const smoothness = 0.15; // Lower = smoother (less shake)
    this.cameraPosition.x += (desiredX - this.cameraPosition.x) * smoothness;
    this.cameraPosition.y += (desiredY - this.cameraPosition.y) * smoothness;
    this.cameraPosition.z += (desiredZ - this.cameraPosition.z) * smoothness;

    this.camera.position.copy(this.cameraPosition);

    // Smooth look-at target as well
    const targetX = localPlayer.position.x;
    const targetY = localPlayer.position.y + 0.5;
    const targetZ = localPlayer.position.z;

    this.cameraTarget.x += (targetX - this.cameraTarget.x) * smoothness;
    this.cameraTarget.y += (targetY - this.cameraTarget.y) * smoothness;
    this.cameraTarget.z += (targetZ - this.cameraTarget.z) * smoothness;

    this.camera.lookAt(this.cameraTarget);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Host: update positions from game simulation
    if (this.isHost && this.gameHost) {
      const players = this.gameHost.getPlayers();
      this.updateGameState(players);
    }

    // Update dash gauge
    if (this.config) {
      let dashCooldown = 0;
      let dashStacks = 3;

      // Get dash data from local player
      if (this.isHost && this.gameHost) {
        const hostPlayer = this.gameHost.players.get(this.localPlayerId);
        if (hostPlayer) {
          dashCooldown = hostPlayer.dashCooldownTimer;
          dashStacks = hostPlayer.dashStacks;
        }
      } else if (this.gameClient && this.gameClient.localPlayer) {
        dashCooldown = this.gameClient.localPlayer.dashCooldownTimer;
        dashStacks = this.gameClient.localPlayer.dashStacks;
      }

      ui.updateDashGauge(dashCooldown, this.config.dashCooldown, dashStacks, this.config.maxDashStacks);
    }

    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    ui.updateFPS();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Start game
window.addEventListener('load', () => {
  new Game();
});
