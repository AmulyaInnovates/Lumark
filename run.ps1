$ErrorActionPreference = "Stop"

Write-Host "Starting backend (server)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList 'cd "$PSScriptRoot/server"; $env:NVIDIA_API_KEY=$env:NVIDIA_API_KEY; $env:NVIDIA_MODEL=$env:NVIDIA_MODEL; npm run dev' | Out-Null

Write-Host "Starting frontend (client)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList 'cd "$PSScriptRoot/client"; npm run dev -- --host' | Out-Null

Write-Host "`nServers launching. Open http://localhost:5173 in your browser." -ForegroundColor Green
