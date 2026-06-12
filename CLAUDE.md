# Tom — The Open Metaverse

Self-hostable voxel metaverse: one Go binary serves the whole game (API + WebSocket multiplayer + built React client). Worlds are decentralized (anyone hosts one); identity is centralized via Telegram through the separate **Tom Passport** service (repo: `tuanona/tma`, runs on :8081).

## Stack

- **server/** — Go 1.25+, Gin, gorilla/websocket, SQLite (modernc, no cgo). Entry: `server/cmd/api/main.go`. Port **8080**.
- **client/** — React 19 + TypeScript, Vite 7, Three.js. Package manager: **Bun** (not npm). Built output in `client/dist/` is served by the Go server.

## Commands

```bash
# Dev (two terminals):
cd server && ADMIN_TELEGRAM_ID=<id> go run ./cmd/api   # API on :8080
cd client && bun run dev                                # Vite on :5173, proxies to :8080

# Production (single binary serves everything at :8080):
cd client && bun install && bun run build
cd server && go run ./cmd/api

# Lint (no test suite exists):
cd client && bun run lint
```

`tom.bat` is the Windows launcher (builds server + runs client dev side by side). `docker-compose.yml` runs server (:8080), tma (:8081), client dev (:5173).

## Env vars (server)

- `BOT_TOKEN` — enables real Telegram auth; **without it the server runs in dev mode (free guest entry)**
- `ADMIN_TELEGRAM_ID` — admin's Telegram user ID (interactive prompt as fallback)
- `PUBLIC_URL` — override auto-detected URL (needed behind tunnels)
- `CLIENT_DIST` — path to built client (default: searches `../client/dist`, `./client/dist`, `client/dist`)

Client dev: `client/.env.development` sets `VITE_API_URL=http://localhost:8080`.

## Architecture

- **Auth** (`server/internal/auth/`): three flows, all minting a session token (30-day max age) stored in SQLite — (1) Telegram Mini App `initData` → `POST /api/auth/tma`; (2) desktop QR `tom1|<serverURL>|<sessionId>` scanned by Tom Passport; (3) invite code → `POST /api/auth/invite-login`, no Telegram needed.
- **Game hub** (`server/internal/game/game.go`): WebSocket at `/api/ws/game?token=<token>`. Goroutine hub, broadcasts player Snapshot at 10Hz. Client→server messages: Move, Chat, PlaceBlock, RemoveBlock. Server→client: Welcome, WorldInit (base64 grid), Snapshot, Chat, BlockPlaced/Removed. Block-edit rate limit: 25/s per client. Chat max 200 chars.
- **World** (`server/internal/world/world.go`): 64×28×64 voxel grid, mutex-protected, persisted as a blob to SQLite every 5s when dirty.
- **Client engine** (`client/src/voxel/`): `engine.ts` (Three.js scene, input, avatars + chat bubbles), `mesher.ts` (16×16 chunks, baked AO), `world.ts` (client grid synced from server). Protocol types in `client/src/lib/protocol.ts`.
- TonConnect manifest served dynamically at `GET /tonconnect-manifest.json` (wallets can't verify on plain localhost — needs an HTTPS tunnel).

## Gotchas

- **Block palette must stay in sync** between `server/internal/world/world.go` (block ID consts, MaxBlockID=15) and `client/src/voxel/palette.ts` (BLOCKS array). Change one → change the other.
- The admin claim code is a 6-digit number printed to the server console at startup; it's entered in the Passport app's Admin tab.
- `tom.db` is created in the server's working directory on first run; it's gitignored — never commit it.
- UI is bilingual (English / Bahasa Indonesia) via `client/src/lib/i18n.ts`.
