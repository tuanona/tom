# Tom — The Open Metaverse 🏝️

**A shared voxel island on The Open Network (TON) — self-hostable, Telegram-native.**

Tom is a persistent voxel world: a floating island people inhabit together. Sign in with Telegram (Tom Passport), walk around, chat, and **build** — place/remove blocks that persist and sync to everyone in real time. Your TON wallet is your identity.

**Run your own world.** One binary serves the whole thing: hand the URL to friends and they're in. Invite codes gate entry — no Telegram account required for invited guests.

## 🌟 What works today

*   **3D voxel world** (Three.js): 64×28×64 floating island, chunk-meshed with baked ambient occlusion — runs smoothly on low-end Android inside Telegram's WebView.
*   **Real-time multiplayer**: presence, movement, chat with speech bubbles (WebSocket, 10Hz snapshots).
*   **Building**: place/remove 15 block types, persisted in SQLite, synced live.
*   **Identity**: QR login via the Telegram Mini App → real session token → your Telegram name above your avatar. Or in-Telegram: open the world from the bot and you're signed in automatically.
*   **Invite-only guests**: friends join your instance with a name + invite code — even on a LAN, no Telegram needed.
*   **i18n**: English by default, Bahasa Indonesia built in (auto-detected, toggleable).
*   **TonConnect** wired (NFT minting comes later).
*   **Dev mode**: without `BOT_TOKEN`, guests can enter freely.

## 🚀 Run your own world

Prerequisites: Go 1.25+, Bun 1.3+ (latest: `bun upgrade`).

```bash
# 1. Build the client once
cd client && bun install && bun run build

# 2. Run the server — it serves the client too
cd ../server
ADMIN_TELEGRAM_ID=<your_telegram_id> go run ./cmd/api
```

Open `http://localhost:8080` — that single URL is the whole product.

*   **Friends on your LAN**: give them `http://<your-LAN-IP>:8080` + an invite code. They enter a name and they're on your island.
*   **Friends on the internet**: expose the same port with a tunnel (`cloudflared tunnel --url http://localhost:8080`) and share the HTTPS URL instead.
*   Without `BOT_TOKEN` the server runs in **dev mode** (guest button works). With `BOT_TOKEN` set, entry requires Telegram auth or an invite code.

Controls: **WASD/arrows** walk · **drag** rotate · **scroll/pinch** zoom · phone: left-half joystick. Build mode (🔨): **tap/click** places, **right-click / ⛏** removes.

For client development with hot reload: `cd client && bun run dev` (uses `.env.development` → API at `:8080`).

### Telegram login (bot: [@tom_survivor_bot](https://t.me/tom_survivor_bot))

```bash
# Game server — same BOT_TOKEN as the bot, disables free guests
cd server && BOT_TOKEN=<token> ADMIN_TELEGRAM_ID=<your_id> go run ./cmd/api

# Tom Passport (TMA) — separate folder: tma-main
cd ../../tma-main && uv sync && uv run python main.py
# .env: BOT_TOKEN=<token>  TMA_URL=<https tunnel to :8081>  WORLD_URL=<https tunnel to :8080, optional>
```

Flows:
*   **In Telegram**: `/start` → **Play Tom's World** (needs `WORLD_URL`) → the world opens inside Telegram and signs you in via `initData`. 
*   **On desktop web**: the world shows a QR (`tom1|<serverURL>|<sessionId>` — it carries *your instance's* URL); scan it from the Passport's 📷 button → approve → desktop is in. Works for **any** self-hosted instance, the Passport proxies to whatever server the QR names.
*   **Owner setup**: Passport → Claim World → enter the admin code printed in your server console → generate invite codes from the Admin tab. Scanned worlds appear under **Worlds** for one-tap return.

### Why doesn't my wallet connect on localhost?

TonConnect wallets fetch your app's manifest from *their* servers — they can't reach `http://localhost`. The server now serves a correct manifest at `/tonconnect-manifest.json` for whatever URL it runs behind, so wallet connect works as soon as the instance is on a public HTTPS URL (tunnel counts). On plain localhost it cannot work — that's a TonConnect rule, not a bug.

## 📂 Structure

*   `server/` — Go (Gin + gorilla/websocket + SQLite): QR/TMA/invite auth, sessions, voxel world (`internal/world`), game hub (`internal/game`), serves `client/dist`.
*   `client/` — React + Vite + Three.js: voxel engine (`src/voxel/`), protocol & i18n (`src/lib/`), HUD.
*   Tom Passport (TMA) lives in its own folder (`tma-main`): FastAPI + python-telegram-bot, multi-server proxy, Worlds list.

WS protocol: `Welcome`, `WorldInit` (base64 grid), `Snapshot`, `Chat`, `BlockPlaced/Removed` ←→ `Move`, `Chat`, `PlaceBlock`, `RemoveBlock`. Block IDs in `server/internal/world/world.go` must stay in sync with `client/src/voxel/palette.ts`.

Env reference — server: `ADMIN_TELEGRAM_ID`, `BOT_TOKEN`, `PUBLIC_URL` (override URL detection), `CLIENT_DIST`. TMA: `BOT_TOKEN`, `TMA_URL`, `WORLD_URL`, `API_URL` (default world), `PORT`.

## 📄 License

MIT
