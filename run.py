"""
Fortis AI Fitness — Root launcher for backend
Run with: python run.py
"""
import sys
import os
from pathlib import Path
import uvicorn

backend_dir = str(Path(__file__).resolve().parent / "backend")
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
