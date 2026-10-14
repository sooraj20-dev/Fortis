"""
Fortis AI Fitness — Single entry point
Run with: python run.py (from backend/ or project root)
"""
import sys
import os
from pathlib import Path
import uvicorn

# Ensure the backend directory is in the Python path regardless of execution directory
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        app_dir=backend_dir,
    )
