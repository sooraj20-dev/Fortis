# Fortis AI Platform - PowerShell Launcher
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       Starting Fortis AI Platform" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$root = $PSScriptRoot
Write-Host "[1/2] Starting Backend (FastAPI + SQLite)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .\venv\Scripts\python.exe run.py"

Write-Host "[2/2] Starting Frontend (React + Vite)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "All services launching!" -ForegroundColor Green
Write-Host "Frontend UI : http://localhost:5173" -ForegroundColor Green
Write-Host "Backend API : http://localhost:8000/docs" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
