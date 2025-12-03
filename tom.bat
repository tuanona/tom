@echo off
setlocal
title Tom Metaverse Launcher

echo 🚀 Starting Tom Metaverse (User Mode)...

:: 1. Start Backend (Go)
if not exist "server\server.exe" (
    echo Building Server...
    cd server
    go build -o server.exe ./cmd/api
    cd ..
)
echo Starting Backend...
start "Go Backend" server\server.exe

:: 2. Start Frontend (React)
echo Starting Frontend (Bun)...
cd client
start "Bun Client" bun run dev
cd ..

echo.
echo 🌐 World is running!
echo    - Game Server: http://localhost:8080
echo    - Web Client:  http://localhost:5173
echo.
echo Press any key to stop...
pause >nul

taskkill /F /IM server.exe >nul 2>nul
taskkill /F /IM bun.exe >nul 2>nul
taskkill /F /IM node.exe >nul 2>nul
echo Stopped.
endlocal
