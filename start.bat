@echo off
title WardScribe - Nursing Documentation System
echo ========================================
echo  WardScribe - Starting Servers
echo ========================================
echo.
echo Starting Backend (port 3001)...
start "WardScribe-Backend" cmd /c "cd /d %~dp0backend && node server.js"
timeout /t 2 /nobreak >nul

echo Starting Frontend (port 5173)...
start "WardScribe-Frontend" cmd /c "cd /d %~dp0frontend && npx vite --host"
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo  Both servers are starting!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:3001
echo.
echo  Close these windows to stop the servers.
echo ========================================
echo.
pause
