# GEMINI.md: Project Analysis for BusDriveVite-prod

## Project Overview

This project, **BusDriveVite-prod**, is a 2.5D city driving game prototype. The player controls a bus, navigating a city to pick up passengers from bus stops within a time limit. The game is built from the ground up using pure WebGL for 3D rendering, without relying on high-level graphics libraries like Three.js or Babylon.js.

The core of the project is written in vanilla JavaScript, using Vite for development and bundling. The game features a tilemap-based city, A* pathfinding for navigation, a mission-based gameplay loop, and physics feedback like drifting and skidmarks.

### Key Technologies:
- **Frontend:** Vanilla JavaScript (ESM)
- **Build Tool:** Vite
- **Graphics:** Pure WebGL with custom GLSL shaders
- **Math Library:** `gl-matrix` for vector and matrix operations.
- **Architecture:** The code is structured into modules for rendering (`renderer/`), game logic (`game/`), and math utilities (`math/`). The main entry point `src/main.js` sets up the UI and initializes the game loop located in `src/game/game.js`. The game state is managed centrally and updated each frame.

## Building and Running

### Prerequisites
- Node.js and npm

### Installation
Install the project dependencies:
```bash
npm install
```

### Development
To run the local development server:
```bash
npm run dev
```
The application will be accessible at `http://localhost:5173`.

### Build for Production
To create a production-ready build:
```bash
npm run build
```
The output will be placed in the `dist/` directory.

### Preview
To preview the production build locally:
```bash
npm run preview
```

## Development Conventions

- **Code Style:** The codebase uses modern JavaScript (ES modules) and is formatted with 2-space indentation. It follows a functional programming approach, with functions like `createSceneRenderer` and `createHud` returning objects that encapsulate state and behavior.
- **Modularity:** The project is well-organized into distinct modules. For example, `src/renderer/` handles all WebGL-related code, while `src/game/` contains the core gameplay logic.
- **State Management:** Game state is managed in a central object, which is created by `createInitialState` and updated by the `updateState` function in `src/game/state.js`.
- **Testing:** The project includes `playwright` as a dev dependency, suggesting end-to-end testing is part of the workflow. The `README.md` also mentions test hooks (`window.render_game_to_text()` and `window.advanceTime(ms)`) for debugging and testing the game state from the browser's developer console.
- **Error Handling:** Errors are caught at various levels and reported to the user via the on-screen HUD.
