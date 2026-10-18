# Fortis AI Platform - PowerShell Launcher
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       Starting Fortis AI Platform" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$root = $PSScriptRoot
$lanIp = $null
$udpClient = New-Object System.Net.Sockets.UdpClient
try {
    $udpClient.Connect("8.8.8.8", 80)
    $lanIp = $udpClient.Client.LocalEndPoint.Address.ToString()
}
catch [System.Net.Sockets.SocketException] {
    Write-Warning "Could not detect a local network IP. The app will still be available on localhost."
}
finally {
    $udpClient.Close()
}

Write-Host "[1/2] Starting Backend (FastAPI + SQLite)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .\venv\Scripts\python.exe run.py"

Write-Host "[2/2] Starting Frontend (React + Vite)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev -- --host 0.0.0.0"

Write-Host ""
Write-Host "All services launching!" -ForegroundColor Green
Write-Host "Frontend UI : http://localhost:5173" -ForegroundColor Green
Write-Host "Backend API : http://localhost:8000/docs" -ForegroundColor Green
if ($lanIp) {
    Write-Host "On this network: http://${lanIp}:5173" -ForegroundColor Green
    Write-Host "Backend API on this network: http://${lanIp}:8000/docs" -ForegroundColor Green
}
Write-Host "Demo User   : demo@fortis.ai / Demo@123" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
