@echo off
title Fortis AI Platform
echo ==========================================
echo       Starting Fortis AI Platform
echo ==========================================

echo [1/2] Starting Backend (FastAPI + SQLite)...
start "Fortis Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\python.exe run.py"

echo [2/2] Starting Frontend (React + Vite)...
start "Fortis Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All services launching!
echo Frontend UI : http://localhost:5173
echo Backend API : http://localhost:8000/docs
echo Demo User   : demo@fortis.ai / Demo@123
echo ==========================================
