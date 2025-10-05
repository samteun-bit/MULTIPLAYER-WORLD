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

      // Set callback for when players are added
      this.gameHost.onPlayerAdded((player) => {
        console.log('🎨 Rendering new player:', player.id);
        this.createPlayerMesh(player);
        ui.updatePlayer(player);
      });

      // Setup disconnect handler
      this.network.onDisconnect((peerId) => {
        this.removePlayerMesh(peerId);
        ui.removePlayer(peerId);
      });
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
    // DON'T set onConnect here - game-host.js already handles it
    // We just need to listen for when players are added to render them

    // Poll for new players and update names
    setInterval(() => {
      if (!this.gameHost) return;

      const players = this.gameHost.getPlayers();
      players.forEach(player => {
        if (!this.players.has(player.id)) {
          console.log('🆕 New player detected, creating mesh:', player.id);
          this.createPlayerMesh(player);
          ui.updatePlayer(player);
        } else {
          // Check if name changed
          const mesh = this.players.get(player.id);
          if (mesh && mesh.userData.playerName !== player.name) {
            this.updatePlayerNameTag(mesh, player.name);
            mesh.userData.playerName = player.name;
            ui.updatePlayer(player);
          }
        }
      });
    }, 100);

    this.network.onDisconnect((peerId) => {
      this.removePlayerMesh(peerId);
      ui.removePlayer(peerId);
    });
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
      this.removePlayerMesh(playerId);
      ui.removePlayer(playerId);
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
    }
  }

  updateGameState(players) {
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
        const lerpFactor = 0.3;

        mesh.position.x += (playerData.position.x - mesh.position.x) * lerpFactor;
        mesh.position.y += (playerData.position.y - mesh.position.y) * lerpFactor;
        mesh.position.z += (playerData.position.z - mesh.position.z) * lerpFactor;

        // Smooth rotation
        let targetRotation = playerData.rotation;
        let currentRotation = mesh.rotation.y;

        // Handle rotation wrapping
        let diff = targetRotation - currentRotation;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;

        mesh.rotation.y += diff * lerpFactor;
      }
    });
  }

  updatePlayerNameTag(mesh, newName) {
    // Find and remove old sprite
    const oldSprite = mesh.children.find(child => child instanceof THREE.Sprite);
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
    mesh.add(sprite);
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

    // Use faster lerp for Y to reduce bounce/shake when jumping
    this.cameraPosition.x += (desiredX - this.cameraPosition.x) * 0.1;
    this.cameraPosition.y += (desiredY - this.cameraPosition.y) * 0.3; // Faster Y response
    this.cameraPosition.z += (desiredZ - this.cameraPosition.z) * 0.1;

    this.camera.position.copy(this.cameraPosition);

    this.cameraTarget.x = localPlayer.position.x;
    this.cameraTarget.y = localPlayer.position.y + 0.5;
    this.cameraTarget.z = localPlayer.position.z;
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
