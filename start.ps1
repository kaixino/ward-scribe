# WardScribe — Startup Script (PowerShell)
# Right-click and "Run with PowerShell" or run from terminal:
#   powershell -ExecutionPolicy Bypass -File start.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WardScribe — Starting Servers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Kill any stale processes on our ports
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Killed stale process on port 3001" -ForegroundColor Yellow
}
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Killed stale process on port 5173" -ForegroundColor Yellow
}

Start-Sleep 1

Write-Host "Starting Backend (port 3001)..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    Set-Location "$using:root\backend"
    node server.js
}

Start-Sleep 2

Write-Host "Starting Frontend (port 5173)..." -ForegroundColor Green
$frontendJob = Start-Job -ScriptBlock {
    Set-Location "$using:root\frontend"
    npx vite --host
}

Start-Sleep 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Both servers are starting!" -ForegroundColor Green
Write-Host " Frontend: http://localhost:5173" -ForegroundColor White
Write-Host " Backend:  http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host " To stop: Close this window or run:" -ForegroundColor Gray
Write-Host "   Stop-Job $($backendJob.Id), $($frontendJob.Id)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan

# Keep script running
while ($true) {
    $be = $backendJob | Receive-Job
    $fe = $frontendJob | Receive-Job
    if ($be) { Write-Host $be -ForegroundColor DarkGray }
    if ($fe) { Write-Host $fe -ForegroundColor DarkGray }
    Start-Sleep 2
}
