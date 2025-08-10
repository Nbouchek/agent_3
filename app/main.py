from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, chat, call, payment, user
from app.database import get_engine
from sqlmodel import SQLModel
import os
from datetime import datetime

app = FastAPI(title="Communication App API", version="1.0.0")

# Determine allowed origins based on environment
def get_allowed_origins():
    """Get allowed origins based on environment."""
    # For development, allow common localhost ports
    dev_origins = [
        "http://localhost:3000",  # React development server
        "http://localhost:19006",  # Expo development server
        "http://localhost:8081",   # React Native Metro bundler
        "http://localhost:19000",  # Expo web
        "http://localhost:3001",   # Additional React dev server
        "http://localhost:5173",   # Vite dev server
        "http://localhost:8080",   # Additional dev server
        "http://127.0.0.1:3000",  # Alternative localhost
        "http://127.0.0.1:19006", # Alternative localhost
    ]

    # For production, add your frontend domains
    prod_origins = [
        "https://comm-app-backend.onrender.com",  # Backend itself
        # Add your frontend domain here when deployed
        # "https://your-frontend-domain.com",
    ]

    # Combine origins
    allowed_origins = dev_origins + prod_origins

    # If in development mode, also allow all origins (remove in production)
    if os.getenv("ENVIRONMENT", "development") == "development":
        allowed_origins.append("*")
    else:
        # In production, ensure we have at least some origins
        if not allowed_origins:
            allowed_origins = ["*"]  # Fallback for production

    return allowed_origins

# Add CORS middleware with proper configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,  # Cache preflight response for 24 hours
)

# Include routers
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(call.router)
app.include_router(payment.router)
app.include_router(user.router)

@app.get("/")
def read_root():
    """
    Root endpoint.

    Returns:
        dict: Hello message.
    """
    return {"Hello": "World"}

@app.get("/debug")
def debug_info():
    """
    Debug endpoint to check environment variables.

    Returns:
        dict: Debug information.
    """
    return {
        "database_url_set": bool(os.getenv("DATABASE_URL")),
        "secret_key_set": bool(os.getenv("SECRET_KEY")),
        "stripe_key_set": bool(os.getenv("STRIPE_API_KEY")),
        "database_url_length": len(os.getenv("DATABASE_URL", "")) if os.getenv("DATABASE_URL") else 0,
        "environment": os.getenv("ENVIRONMENT", "development"),
        "allowed_origins": get_allowed_origins(),
        "cors_enabled": True
    }

@app.get("/health")
def health_check():
    """
    Health check endpoint for Render.

    Returns:
        dict: Health status.
    """
    try:
        # Try to connect to database
        engine = get_engine()
        with engine.connect() as conn:
            # SQLAlchemy 2.x requires text or exec_driver_sql for raw strings
            conn.exec_driver_sql("SELECT 1")
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """
    Handle OPTIONS requests for CORS preflight.

    Args:
        full_path (str): The full path being requested.

    Returns:
        dict: CORS headers response.
    """
    return {
        "message": "CORS preflight handled",
        "path": full_path,
        "allowed_origins": get_allowed_origins()
    }

@app.on_event("startup")
def on_startup():
    """Initialize database and other startup tasks."""
    try:
        # Set environment for production if not set
        if not os.getenv("ENVIRONMENT"):
            os.environ["ENVIRONMENT"] = "production"

        print(f"Starting up in {os.getenv('ENVIRONMENT', 'development')} mode")

        # Try to create database tables
        try:
            SQLModel.metadata.create_all(get_engine())
            print("Database tables created successfully")
        except Exception as db_error:
            print(f"Database initialization failed: {db_error}")
            print("App will continue without database initialization")

    except Exception as e:
        print(f"Startup error: {e}")
        print("App will continue with limited functionality")
