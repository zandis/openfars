"""
OpenFARS — Server entry point.
Run with: python run_server.py
Or on Replit: automatically detected via .replit config.
"""

import os
import uvicorn
from server.app import app  # noqa: F401

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "server.app:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("OPENFARS_DEV", "") == "1",
    )
