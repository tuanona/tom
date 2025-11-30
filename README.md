# TOM

> A Decentralized Metaverse Platform on TON.

## Prerequisites
-   **Go**: v1.23+
-   **Bun**: v1.1+
-   **Git**

## Quick Start

### Windows (PowerShell)
Run the unified start script:
```powershell
.\run.ps1
```

### Manual Run
**Backend:**
```bash
cd server
go mod tidy
go run ./cmd/api
```

**Frontend:**
```bash
cd client
bun install
bun run dev
```

## Architecture
-   **Backend**: Go (Gin + WebSockets + SQLite)
-   **Frontend**: React (Vite + Bun + TON Connect)

## License
MIT
