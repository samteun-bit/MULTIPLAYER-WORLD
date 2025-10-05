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
      jump: false
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

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
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
      const roomId = await this.network.createRoom();
      document.getElementById('room-code').textContent = roomId;

      document.getElementById('btn-host').style.display = 'none';
      document.getElementById('btn-join').style.display = 'none';
      document.getElementById('room-info').style.display = 'block';

      this.isHost = true;

      // Create game host IMMEDIATELY when hosting starts
      console.log('🎮 Creating GameHost immediately on host click');
      this.gameHost = new GameHost(this.network);

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

    try {
      document.getElementById('btn-join-room').disabled = true;
      document.getElementById('btn-join-room').textContent = 'Connecting...';

      // Setup client FIRST - before connecting
      console.log('🔧 Creating GameClient');
      this.gameClient = new GameClient(this.network);
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

    // Poll for new players
    setInterval(() => {
      if (!this.gameHost) return;

      const players = this.gameHost.getPlayers();
      players.forEach(player => {
        if (!this.players.has(player.id)) {
          console.log('🆕 New player detected, creating mesh:', player.id);
          this.createPlayerMesh(player);
          ui.updatePlayer(player);
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

    mesh.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );

    this.scene.add(mesh);
    this.players.set(playerData.id, mesh);

    console.log('✅ Created player mesh:', playerData.id);
  }

  removePlayerMesh(playerId) {
    const mesh = this.players.get(playerId);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.players.delete(playerId);
    }
  }

  updateGameState(players) {
    players.forEach(playerData => {
      const mesh = this.players.get(playerData.id);
      if (mesh) {
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
            } else {
              console.warn('⚠️ Local state is null!');
            }
          } else {
            console.warn('⚠️ gameClient or getLocalPlayerState not available!', {
              hasGameClient: !!this.gameClient,
              hasMethod: this.gameClient ? !!this.gameClient.getLocalPlayerState : false
            });
          }
          // Fallback to server state if prediction not available
          console.warn('⚠️ Using server position for local player (this causes stuttering)');
          mesh.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
          );
          mesh.rotation.y = playerData.rotation;
          return;
        }

        // Smooth interpolation for remote players
        const lerpFactor = 0.2; // Slightly increased since local player is now instant

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

    this.cameraPosition.x += (desiredX - this.cameraPosition.x) * 0.1;
    this.cameraPosition.y += (desiredY - this.cameraPosition.y) * 0.1;
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
