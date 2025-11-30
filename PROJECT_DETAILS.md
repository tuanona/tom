# TOM: Decentralized Metaverse Platform

## Vision
TOM is a decentralized metaverse platform designed to empower individuals to host their own "worlds" or "gardens". Unlike centralized platforms (Roblox, Minecraft servers), TOM envisions a future where every user runs their own server instance, accessible via a unified client or standard web protocols. Access is controlled via Telegram Mini Apps (TMA) and TON Blockchain authentication, ensuring a secure and decentralized identity layer.

## Architecture

### Monorepo Structure
The project is structured as a Monorepo (`tom/`) containing both the backend and frontend to ensure type safety and cohesive development.

```
tom/
├── server/          # Go Backend (The "World Server")
├── client/          # React Frontend (The "Window" into the world)
└── run.ps1          # Unified orchestration script
```

### Backend (`server/`)
-   **Language**: Go (Golang) 1.23+
-   **Framework**: Gin (HTTP), Gorilla WebSocket (Real-time)
-   **Database**: SQLite (Embedded, CGO-free via `modernc.org/sqlite`)
-   **Key Components**:
    -   `cmd/api/main.go`: Entry point. Initializes DB, Hub, and HTTP server.
    -   `internal/game/game.go`: The heart of the multiplayer logic. Manages the `Hub`, client connections, and broadcasts `WorldUpdate` messages.
    -   `internal/auth/auth.go`: Handles TMA validation and TON Connect signaling (Placeholder for now).
    -   `internal/db/db.go`: Manages SQLite connection and schema migrations.

### Frontend (`client/`)
-   **Runtime**: Bun
-   **Framework**: React + Vite
-   **Language**: TypeScript
-   **Integration**:
    -   `@tma.js/sdk`: For running natively inside Telegram.
    -   `@tonconnect/ui-react`: For wallet connection and NFT interactions.
-   **Rendering**: HTML5 Canvas (Custom implementation in `GameCanvas`).

## Features

### 1. Multiplayer Interaction
-   **Real-time Movement**: Users control an avatar (currently a square) using arrow keys.
-   **Broadcasting**: Movement updates are sent via WebSocket to the Go server, which broadcasts the new state to all connected clients.
-   **State Management**: The server maintains an in-memory map of players and persists coordinates to SQLite.

### 2. Authentication & Identity
-   **TON Connect**: Users connect their TON wallets to identify themselves.
-   **TMA Integration**: Designed to run as a Telegram Mini App, using Telegram's user data for session verification.

### 3. Decentralization
-   **Self-Hosting**: The architecture is lightweight enough to run on a personal PC.
-   **Portability**: SQLite database ensures data is local and portable.

## Future Roadmap

### Short Term
-   **NFT Integration**: Minting game assets (skins, items) directly to the TON blockchain.
-   **Chat System**: Proximity-based voice or text chat using the existing WebSocket connection.
-   **Asset Loading**: Replacing the canvas squares with pixel art or 3D assets (Three.js).

### Long Term
-   **Federation**: Allowing different TOM servers to communicate, letting users "travel" between worlds.
-   **Scripting**: A Lua or JS sandbox to allow server owners to script their own game logic (like Roblox).
-   **Economy**: A native token or TON-based economy for trading assets between worlds.

## Technical Constraints & Decisions
-   **Why Go?**: High performance, easy concurrency for WebSockets, and single-binary deployment.
-   **Why Bun?**: Fast startup times and modern tooling for the frontend.
-   **Why SQLite?**: Zero-configuration database perfect for self-hosting.
