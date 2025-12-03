# Tom - Decentralized Metaverse with Centralized Passport

**Tom** is a metaverse platform where the **Worlds** are decentralized, but the **Identity** is centralized via Telegram.

## 🌍 The Concept
Imagine a universe with many different planets (Servers). Anyone can host a planet.
*   **Planets (Servers)**: Decentralized. Hosted by anyone (e.g., one in Africa, one in Indonesia).
*   **Passport (TMA)**: Centralized. Your single identity (Telegram Account) that lets you travel to *any* planet.

## 🏗 Architecture

### 1. The Passport (`/tma`)
*   **Role**: The Central Authority.
*   **Hosted By**: The "Official" entity (or you, if you run your own ecosystem).
*   **Secrets**: Holds the `BOT_TOKEN`.
*   **Function**:
    *   Runs the **Telegram Bot**.
    *   Verifies user identity via Telegram.
    *   Signs "Travel Visas" (Tokens) that allow users to log in to Game Servers.
*   **Tech**: Bun, React, Telegram SDK.

### 2. The World (`/server`)
*   **Role**: The Game Instance.
*   **Hosted By**: Community Members (You, me, anyone).
*   **Secrets**: NONE (No Bot Token needed!).
*   **Function**:
    *   Hosts the game world (players, chat, physics).
    *   Trusts the "Travel Visas" signed by the Passport.
*   **Tech**: Go (Golang).

### 3. The Viewport (`/client`)
*   **Role**: The Window.
*   **Function**: Connects to a World and displays the graphics.
*   **Tech**: React, Vite.

## 🚀 How it Works
1.  **Host a World**: You run `./server`. It generates a QR Code.
2.  **Open Passport**: User opens the **Tom Bot** on Telegram.
3.  **Scan**: User scans the World's QR Code with the Passport (TMA).
4.  **Login**: The Passport tells the World "This is User X, they are legit." The World logs them in.

## 🛠 Setup
*   **To Host a World**: Just run `.\run.ps1` (Windows) or `docker-compose up`. No config needed!
*   **To Run the Passport**: You need a Telegram Bot Token. See `tma/README.md`.
