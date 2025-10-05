// Client-side game logic with Three.js and Socket.IO
class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.socket = null;

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

    // Camera smoothing
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();

    // Mouse controls for camera (click and drag)
    this.mouse = {
      isDragging: false,
      lastX: 0,
      lastY: 0
    };
    this.cameraRotation = {
      yaw: 0,   // Horizontal rotation
      pitch: 0  // Vertical rotation
    };

    this.init();
  }

  init() {
    this.setupThreeJS();
    this.setupControls();
    this.connectToServer();
  }

  // Initialize Three.js scene
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

    // Grid helper
    const gridHelper = new THREE.GridHelper(
      CONFIG.world.gridSize,
      CONFIG.world.gridDivisions,
      0x444444,
      0x222222
    );
    this.scene.add(gridHelper);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start render loop
    this.animate();
  }

  // Setup keyboard and mouse controls
  setupControls() {
    // Keyboard controls
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Mouse controls - Click and drag
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Handle mouse down
  onMouseDown(event) {
    this.mouse.isDragging = true;
    this.mouse.lastX = event.clientX;
    this.mouse.lastY = event.clientY;
  }

  // Handle mouse up
  onMouseUp(event) {
    this.mouse.isDragging = false;
  }

  // Handle mouse movement
  onMouseMove(event) {
    if (!this.mouse.isDragging) return;

    const deltaX = event.clientX - this.mouse.lastX;
    const deltaY = event.clientY - this.mouse.lastY;

    // Update camera rotation based on mouse drag
    this.cameraRotation.yaw -= deltaX * CONFIG.camera.mouseSensitivity;
    this.cameraRotation.pitch -= deltaY * CONFIG.camera.mouseSensitivity;

    // Clamp vertical rotation
    this.cameraRotation.pitch = Math.max(
      -CONFIG.camera.maxPolarAngle,
      Math.min(-CONFIG.camera.minPolarAngle, this.cameraRotation.pitch)
    );

    this.mouse.lastX = event.clientX;
    this.mouse.lastY = event.clientY;
  }

  onKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
        this.keys.forward = true;
        break;
      case 'KeyS':
        this.keys.backward = true;
        break;
      case 'KeyA':
        this.keys.left = true;
        break;
      case 'KeyD':
        this.keys.right = true;
        break;
      case 'Space':
        this.keys.jump = true;
        event.preventDefault();
        break;
    }
    this.sendInput();
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        this.keys.forward = false;
        break;
      case 'KeyS':
        this.keys.backward = false;
        break;
      case 'KeyA':
        this.keys.left = false;
        break;
      case 'KeyD':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
    }
    this.sendInput();
  }

  // Send input to server
  sendInput() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('input', {
        forward: this.keys.forward,
        backward: this.keys.backward,
        left: this.keys.left,
        right: this.keys.right,
        jump: this.keys.jump
      });
    }
  }

  // Connect to server via Socket.IO
  connectToServer() {
    this.socket = io(CONFIG.server.url);

    // Connection established
    this.socket.on('connect', () => {
      console.log('Connected to server');
      ui.updateConnectionStatus(true);
    });

    // Initialize game with player data
    this.socket.on('init', (data) => {
      console.log('Game initialized', data);
      this.localPlayerId = data.playerId;
      this.gameConfig = data.config;

      ui.setLocalPlayerId(this.localPlayerId);

      // Create all existing players
      data.players.forEach(player => {
        this.createPlayer(player);
        ui.updatePlayer(player);
      });

      ui.hideLoadingScreen();
    });

    // New player joined
    this.socket.on('playerJoined', (player) => {
      console.log('Player joined', player);
      this.createPlayer(player);
      ui.updatePlayer(player);
    });

    // Player left
    this.socket.on('playerLeft', (playerId) => {
      console.log('Player left', playerId);
      this.removePlayer(playerId);
      ui.removePlayer(playerId);
    });

    // Game state update
    this.socket.on('gameState', (players) => {
      this.updateGameState(players);
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      ui.showDisconnected();
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Connection error', error);
      ui.showError('Failed to connect to server');
    });
  }

  // Create a new player cube
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

  // Remove player
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.scene.remove(player);
      player.geometry.dispose();
      player.material.dispose();
      this.players.delete(playerId);
    }
  }

  // Update game state from server
  updateGameState(players) {
    players.forEach(playerData => {
      const player = this.players.get(playerData.id);
      if (player) {
        // Update position
        player.position.set(
          playerData.position.x,
          playerData.position.y,
          playerData.position.z
        );

        // Update rotation
        player.rotation.y = playerData.rotation;
      }
    });
  }

  // Update camera to follow local player with mouse rotation
  updateCamera() {
    const localPlayer = this.players.get(this.localPlayerId);
    if (!localPlayer) return;

    const playerPos = localPlayer.position;

    // Calculate camera position based on mouse rotation
    const distance = CONFIG.camera.offsetZ;
    const height = CONFIG.camera.offsetY;

    // Calculate camera position using spherical coordinates
    const offsetX = distance * Math.sin(this.cameraRotation.yaw) * Math.cos(this.cameraRotation.pitch);
    const offsetY = height + distance * Math.sin(this.cameraRotation.pitch);
    const offsetZ = distance * Math.cos(this.cameraRotation.yaw) * Math.cos(this.cameraRotation.pitch);

    const desiredCameraX = playerPos.x + offsetX;
    const desiredCameraY = playerPos.y + offsetY;
    const desiredCameraZ = playerPos.z + offsetZ;

    // Smooth camera movement
    this.cameraPosition.x += (desiredCameraX - this.cameraPosition.x) * CONFIG.player.cameraSmoothing;
    this.cameraPosition.y += (desiredCameraY - this.cameraPosition.y) * CONFIG.player.cameraSmoothing;
    this.cameraPosition.z += (desiredCameraZ - this.cameraPosition.z) * CONFIG.player.cameraSmoothing;

    this.camera.position.copy(this.cameraPosition);

    // Look at player (slightly above)
    this.cameraTarget.x = playerPos.x;
    this.cameraTarget.y = playerPos.y + CONFIG.camera.lookAtOffsetY;
    this.cameraTarget.z = playerPos.z;
    this.camera.lookAt(this.cameraTarget);
  }

  // Animation loop
  animate() {
    requestAnimationFrame(() => this.animate());

    this.updateCamera();
    this.renderer.render(this.scene, this.camera);

    // Update FPS counter
    ui.updateFPS();
  }

  // Handle window resize
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Start the game when page loads
window.addEventListener('load', () => {
  new Game();
});
