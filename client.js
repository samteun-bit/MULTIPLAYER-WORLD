// Main client application - integrates networking, game logic, and rendering
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
    this.roomId = null;

    // Game state
    this.players = new Map(); // playerId -> mesh
    this.localPlayerId = null;
    this.gameConfig = null;

    // Input state
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
    this.cameraRotation = {
      yaw: 0,
      pitch: 0
    };

    // UI Elements
    this.roomMenu = document.getElementById('room-menu');
    this.loadingScreen = document.getElementById('loading-screen');

    this.init();
  }

  async init() {
    this.setupThreeJS();
    this.setupControls();
    this.setupRoomMenu();

    // Initialize networking
    try {
      this.network = new NetworkManager();
      await this.network.initialize();

      // Show room menu
      this.loadingScreen.classList.add('hidden');
      this.roomMenu.style.display = 'block';
    } catch (error) {
      console.error('Failed to initialize networking:', error);
      ui.showError('Failed to connect to server');
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
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: CONFIG.renderer.antialias });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(
      CONFIG.lighting.ambient.color,
      CONFIG.lighting.ambient.intensity
    );
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(
      CONFIG.lighting.directional.color,
      CONFIG.lighting.directional.intensity
    );
    directionalLight.position.set(
      CONFIG.lighting.directional.position.x,
      CONFIG.lighting.directional.position.y,
      CONFIG.lighting.directional.position.z
    );
    this.scene.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(
      CONFIG.world.groundSize,
      CONFIG.world.groundSize
    );
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: CONFIG.world.groundColor
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(
      CONFIG.world.gridSize,
      CONFIG.world.gridDivisions,
      0x444444,
      0x222222
    );
    this.scene.add(gridHelper);

    // Window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start render loop
    this.animate();
  }

  setupControls() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  setupRoomMenu() {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const btnBack = document.getElementById('btn-back');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnCopyCode = document.getElementById('btn-copy-code');
    const joinRoomForm = document.getElementById('join-room-form');
    const roomInfo = document.getElementById('room-info');
    const roomIdInput = document.getElementById('room-id-input');
    const errorMessage = document.getElementById('error-message');

    btnHost.addEventListener('click', async () => {
      try {
        btnHost.disabled = true;
        btnJoin.disabled = true;

        this.roomId = await this.network.createRoom('Host');
        this.isHost = true;

        // Show room code
        document.getElementById('room-code').textContent = this.roomId;
        btnHost.style.display = 'none';
        btnJoin.style.display = 'none';
        roomInfo.style.display = 'block';

        console.log('Room created:', this.roomId);
      } catch (error) {
        console.error('Failed to create room:', error);
        this.showError('Failed to create room');
        btnHost.disabled = false;
        btnJoin.disabled = false;
      }
    });

    btnJoin.addEventListener('click', () => {
      btnHost.style.display = 'none';
      btnJoin.style.display = 'none';
      joinRoomForm.style.display = 'block';
    });

    btnBack.addEventListener('click', () => {
      joinRoomForm.style.display = 'none';
      btnHost.style.display = 'block';
      btnJoin.style.display = 'block';
      roomIdInput.value = '';
      errorMessage.style.display = 'none';
    });

    btnJoinRoom.addEventListener('click', async () => {
      const hostPeerId = roomIdInput.value.trim();
      if (!hostPeerId) {
        this.showError('Please enter host Peer ID');
        return;
      }

      try {
        btnJoinRoom.disabled = true;
        await this.network.joinRoom(hostPeerId, 'Player');
        this.isHost = false;

        // Start game as client
        this.startGameAsClient();
      } catch (error) {
        console.error('Failed to join room:', error);
        this.showError(error.message);
        btnJoinRoom.disabled = false;
      }
    });

    btnStartGame.addEventListener('click', () => {
      this.startGameAsHost();
    });

    btnCopyCode.addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomId);
      const originalText = btnCopyCode.textContent;
      btnCopyCode.textContent = 'Copied!';
      setTimeout(() => {
        btnCopyCode.textContent = originalText;
      }, 2000);
    });
  }

  showError(message) {
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 3000);
  }

  startGameAsHost() {
    console.log('Starting game as host');
    this.roomMenu.style.display = 'none';

    // Initialize game host
    this.gameHost = new GameHost(this.network);
    const initData = this.gameHost.start();

    this.localPlayerId = this.network.peerId;
    this.gameConfig = initData.config;

    // Initialize UI
    ui.setLocalPlayerId(this.localPlayerId);
    initData.players.forEach(player => {
      this.createPlayer(player);
      ui.updatePlayer(player);
    });

    // Setup callbacks for new players
    this.network.onPlayerJoined((peerId) => {
      const players = this.gameHost.getGameState();
      const newPlayer = players.find(p => p.id === peerId);
      if (newPlayer) {
        this.createPlayer(newPlayer);
        ui.updatePlayer(newPlayer);
      }
    });

    this.network.onPlayerLeft((peerId) => {
      this.removePlayer(peerId);
      ui.removePlayer(peerId);
    });

    ui.updateConnectionStatus(true);
  }

  startGameAsClient() {
    console.log('Starting game as client');
    this.roomMenu.style.display = 'none';

    // Initialize game client
    this.gameClient = new GameClient(this.network);

    this.gameClient.onInit((data) => {
      console.log('Client initialized', data);
      this.localPlayerId = data.localPlayerId;
      this.gameConfig = data.config;

      ui.setLocalPlayerId(this.localPlayerId);

      data.players.forEach(player => {
        this.createPlayer(player);
        ui.updatePlayer(player);
      });

      ui.updateConnectionStatus(true);
    });

    this.gameClient.onGameState((players) => {
      this.updateGameState(players);
    });

    this.gameClient.onPlayerJoined((player) => {
      this.createPlayer(player);
      ui.updatePlayer(player);
    });

    this.gameClient.onPlayerLeft((playerId) => {
      this.removePlayer(playerId);
      ui.removePlayer(playerId);
    });

    this.gameClient.start();
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
    const inputData = {
      ...this.keys,
      cameraYaw: this.cameraRotation.yaw
    };

    if (this.isHost && this.gameHost) {
      this.gameHost.updateLocalInput(inputData);
    } else if (this.gameClient) {
      this.gameClient.updateInput(inputData);
    }
  }

  createPlayer(playerData) {
    if (this.players.has(playerData.id)) return;

    const geometry = new THREE.BoxGeometry(
      CONFIG.player.size,
      CONFIG.player.size,
      CONFIG.player.size
    );
    const material = new THREE.MeshLambertMaterial({ color: playerData.color });
    const cube = new THREE.Mesh(geometry, material);

    cube.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );

    this.scene.add(cube);
    this.players.set(playerData.id, cube);
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.scene.remove(player);
      player.geometry.dispose();
      player.material.dispose();
      this.players.delete(playerId);
    }
  }

  updateGameState(players) {
    players.forEach(playerData => {
      const player = this.players.get(playerData.id);
      if (player) {
        player.position.set(
          playerData.position.x,
          playerData.position.y,
          playerData.position.z
        );
        player.rotation.y = playerData.rotation;
      }
    });

    // Update host's own player rendering
    if (this.isHost && this.gameHost) {
      const hostPlayers = this.gameHost.getGameState();
      hostPlayers.forEach(playerData => {
        const player = this.players.get(playerData.id);
        if (player) {
          player.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
          );
          player.rotation.y = playerData.rotation;
        }
      });
    }
  }

  updateCamera() {
    const localPlayer = this.players.get(this.localPlayerId);
    if (!localPlayer) return;

    const playerPos = localPlayer.position;

    const distance = CONFIG.camera.offsetZ;
    const height = CONFIG.camera.offsetY;

    const offsetX = distance * Math.sin(this.cameraRotation.yaw) * Math.cos(this.cameraRotation.pitch);
    const offsetY = height + distance * Math.sin(this.cameraRotation.pitch);
    const offsetZ = distance * Math.cos(this.cameraRotation.yaw) * Math.cos(this.cameraRotation.pitch);

    const desiredCameraX = playerPos.x + offsetX;
    const desiredCameraY = playerPos.y + offsetY;
    const desiredCameraZ = playerPos.z + offsetZ;

    this.cameraPosition.x += (desiredCameraX - this.cameraPosition.x) * CONFIG.player.cameraSmoothing;
    this.cameraPosition.y += (desiredCameraY - this.cameraPosition.y) * CONFIG.player.cameraSmoothing;
    this.cameraPosition.z += (desiredCameraZ - this.cameraPosition.z) * CONFIG.player.cameraSmoothing;

    this.camera.position.copy(this.cameraPosition);

    this.cameraTarget.x = playerPos.x;
    this.cameraTarget.y = playerPos.y + CONFIG.camera.lookAtOffsetY;
    this.cameraTarget.z = playerPos.z;
    this.camera.lookAt(this.cameraTarget);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

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

// Start the game
window.addEventListener('load', () => {
  new Game();
});
