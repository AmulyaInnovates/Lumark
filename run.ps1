$ErrorActionPreference = "Stop"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "   Zynapse PDF Insight Lab" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

Write-Host "Starting backend (server)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList 'cd "$PSScriptRoot/server"; npm run dev' -WindowStyle Normal

Write-Host "Starting frontend (client)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList 'cd "$PSScriptRoot/client"; npm run dev -- --host' -WindowStyle Normal

Write-Host "`nWaiting for servers to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "`n[SUCCESS] Servers are launching!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Backend API: http://localhost:4000" -ForegroundColor Green
Write-Host "`nPlease keep the new terminal windows open while using the app." -ForegroundColor White
