#!/usr/bin/env python3
"""
Startup script for Render deployment.
This script ensures proper environment setup and starts the FastAPI application.
"""

import os
import sys
from pathlib import Path

# Add the app directory to Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

# Import and start the app
from app.main import app

if __name__ == "__main__":
    import uvicorn

    # Get port from environment (Render sets PORT)
    port = int(os.getenv("PORT", 8000))

    # Start the server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Disable reload in production
        log_level="info"
    )
