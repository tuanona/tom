# Tom Metaverse v0.1.0 🌍

**"Bring Your Own Server" Decentralized Metaverse**

Tom Metaverse is a decentralized gaming platform where anyone can host their own game server. The Telegram Mini App (TMA) acts as a centralized "Passport" for players and an "Admin Panel" for server owners.

## 🌟 Key Features

*   **Decentralized Hosting**: Anyone can run a server (`server.exe`).
*   **Centralized Passport**: One TMA for all servers.
*   **QR Login**: Seamless login via Telegram QR scan.
*   **Invite System**: Servers are private by default; require invite codes.
*   **Admin Control**: Full server management via TMA (Invite generation, etc.).
*   **Premium UI**: Telegram-native design language.

## 🚀 Quick Start

### Prerequisites
*   Windows (for batch scripts)
*   Go 1.23+
*   Bun 1.0+
*   Python 3.11+
*   Telegram Bot Token

### Installation

1.  **Clone the repo**
    ```bash
    git clone https://github.com/yourusername/tom.git
    cd tom
    ```

2.  **Setup Environment**
    *   Create `tma/.env` with `BOT_TOKEN` and `TMA_URL`.
    *   Create `server/.env` (optional).

3.  **Run Development Stack**
    ```bash
    .\run_dev.bat
    ```
    *   Starts Game Server (8080)
    *   Starts Web Client (5173)
    *   Starts TMA Bot (8081) + Tunnel

### Hosting a World

1.  **Run Server Only**
    ```bash
    .\tom.bat
    ```
2.  **Claim Ownership**
    *   Enter your Telegram User ID when prompted.
    *   Scan the QR code on `localhost:5173`.
    *   You are now the **Tuan** (Owner)! 👑

## 📂 Project Structure

*   `server/`: Go Game Server (Gin + WebSocket)
*   `client/`: React + Bun Game Client
*   `tma/`: Python FastAPI Telegram Mini App
*   `tom.bat`: Script for hosting
*   `run_dev.bat`: Script for development

## 🤝 Contributing

Pull requests are welcome! Please read `CONTRIBUTING.md` (coming soon).

## 📄 License

MIT
