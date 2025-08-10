#!/usr/bin/env python3
"""
Simple test script to verify CORS configuration.
"""
import os
import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

# Set environment variables for testing
os.environ['DATABASE_URL'] = 'sqlite:///test.db'
os.environ['SECRET_KEY'] = 'test-key'
os.environ['STRIPE_API_KEY'] = 'test-stripe-key'

try:
    from main import app, get_allowed_origins
    print("✅ App imported successfully!")
    print(f"✅ Allowed origins: {get_allowed_origins()}")
    print("✅ CORS middleware configured")

    # Test the CORS configuration
    from fastapi.middleware.cors import CORSMiddleware
    cors_middleware = None
    for middleware in app.user_middleware:
        if isinstance(middleware.cls, type) and issubclass(middleware.cls, CORSMiddleware):
            cors_middleware = middleware
            break

    if cors_middleware:
        print("✅ CORS middleware found in app")
        print(f"✅ CORS options: {cors_middleware.options}")
    else:
        print("❌ CORS middleware not found")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
