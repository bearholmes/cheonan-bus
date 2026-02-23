# GEMINI.md: Project Analysis for BusDriveVite-prod

## Project Overview

**BusDriveVite-prod** (also known as "Cheonan Bus" or "천안 버스") is a 3D bus driving simulation game built with **Pure WebGL** and **Vanilla JavaScript**, using **Vite** as the build tool.

The game focuses on driving a bus through a course, picking up passengers at designated stops within a time limit. It features a custom 3D rendering engine written from scratch (no Three.js/Babylon.js) and a fixed-timestep game loop with interpolation for smooth physics.

### Key Technologies
-   **Frontend:** Vanilla JavaScript (ESM)
-   **Build Tool:** Vite
-   **Graphics:** Custom WebGL Engine (Shaders, Instanced Rendering, Ribbon Rendering)
-   **Math:** `gl-matrix` for matrix/vector operations
-   **Testing:** Playwright (for E2E/scenario verification)

## Project Architecture

The codebase is modular, separating rendering, game logic, and state management.

### Directory Structure
-   `src/main.js`: Application entry point. Sets up the DOM, UI overlays, HUD elements, and initializes the game.
-   `src/game/`: Core gameplay logic.
    -   `game.js`: The main game loop. Implements a fixed-timestep update cycle (60Hz) with render interpolation (`lerp`). Handles input processing and state updates.
    -   `state.js`: Manages the central game state object (physics, road generation, passenger logic).
    -   `hud.js`: Updates the Heads-Up Display (timer, speed, navigation, messages).
    -   `input.js`: Handles keyboard input.
-   `src/renderer/`: All WebGL-related code.
    -   `scene.js`: The main renderer. Handles drawing the road (ribbons), props (instanced meshes for trees/signs), and the bus.
    -   `gl.js`: WebGL context initialization and helper functions (shader compilation).
    -   `mesh.js`, `geometry.js`: Utilities for creating and managing 3D geometry (buffers, attributes).
-   `src/math/`: Math utilities (wrappers around `gl-matrix`).

### Key Concepts
-   **State Management:** The game relies on a single mutable `state` object created in `state.js`. This object is updated in the physics loop and read by the renderer.
-   **Rendering:**
    -   **Road:** Rendered as a dynamic "ribbon" mesh generated from road samples.
    -   **Props:** Trees, signs, and towers are rendered using **Hardware Instancing** (`ANGLE_instanced_arrays`) for performance.
    -   **Bus:** Composed of multiple hierarchical meshes (body, wheels, windows) manipulated via matrix transformations.
-   **Game Loop:** The loop in `game.js` uses a `FIXED_STEP` (1/60s) for physics updates to ensure deterministic behavior, while rendering happens as fast as possible using linear interpolation between the previous and current state to smooth out motion.

## Building and Running

### Prerequisites
-   Node.js and npm

### Commands
```bash
# Install dependencies
npm install

# Start local development server (accessible at http://localhost:5173)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build locally
npm run preview
```

## Development Conventions

-   **Code Style:** Modern JavaScript (ES Modules). No transpilation (other than what Vite provides).
-   **Functional Pattern:** The codebase prefers factory functions (e.g., `createSceneRenderer`, `createHud`) that return objects/closures over Javascript classes.
-   **Debugging/Testing Hooks:** The game exposes global methods on the `window` object for automated testing and debugging:
    -   `window.render_game_to_text()`: Dumps the current game state as JSON.
    -   `window.advanceTime(ms)`: Fast-forwards the game simulation by a specific amount of time.
-   **Error Handling:** Errors in the game loop or renderer are caught and displayed via the in-game HUD (`hud.reportError`).

## Controls
-   **Drive:** `W` / `ArrowUp` (Accelerate), `S` / `ArrowDown` (Brake/Reverse)
-   **Steer:** `A` / `D` or `Left` / `Right` Arrows
-   **Interact:** `Space` (Open/Close Doors at stops)
-   **System:** `Enter` (Start), `F` (Fullscreen)
