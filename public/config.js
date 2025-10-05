// Game configuration - centralized settings
const CONFIG = {
  // Server connection
  server: {
    url: window.location.origin
  },

  // Camera settings
  camera: {
    fov: 75,
    near: 0.1,
    far: 1000,
    offsetY: 8,      // Camera height above player
    offsetZ: 12,     // Camera distance behind player
    lookAtOffsetY: 2, // Look at point offset above player
    mouseSensitivity: 0.002, // Mouse rotation sensitivity
    minPolarAngle: Math.PI / 6,  // Minimum vertical angle (30 degrees)
    maxPolarAngle: Math.PI / 2.5 // Maximum vertical angle (72 degrees)
  },

  // Rendering settings
  renderer: {
    antialias: true,
    backgroundColor: 0x87ceeb // Sky blue
  },

  // World settings
  world: {
    groundSize: 100,
    groundColor: 0x2d5016, // Dark green
    gridSize: 100,
    gridDivisions: 100
  },

  // Player settings
  player: {
    size: 1,
    cameraSmoothing: 0.1 // Lower = smoother, higher = more responsive
  },

  // Lighting
  lighting: {
    ambient: {
      color: 0xffffff,
      intensity: 0.6
    },
    directional: {
      color: 0xffffff,
      intensity: 0.8,
      position: { x: 10, y: 20, z: 10 }
    }
  },

  // Controls display
  controls: {
    keys: [
      { key: 'W', action: 'Move Forward' },
      { key: 'A', action: 'Move Left' },
      { key: 'S', action: 'Move Backward' },
      { key: 'D', action: 'Move Right' },
      { key: 'Space', action: 'Jump' },
      { key: 'Mouse', action: 'Look Around' }
    ]
  }
};

// Make config available globally
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
