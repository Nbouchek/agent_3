from sqlmodel import create_engine, Session
import os
from dotenv import load_dotenv

# Only load .env file in development
if os.getenv("ENVIRONMENT", "development") == "development":
    load_dotenv()

def get_database_url():
    """Get database URL from environment variables."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")

    # Handle Render's SSL requirements for PostgreSQL
    if database_url.startswith("postgresql://") and os.getenv("ENVIRONMENT") == "production":
        # Add SSL mode for production (Render requires this)
        if "?" not in database_url:
            database_url += "?sslmode=require"
        elif "sslmode=" not in database_url:
            database_url += "&sslmode=require"

    return database_url

def get_engine():
    """Get database engine, creating it if necessary."""
    if not hasattr(get_engine, '_engine'):
        database_url = get_database_url()
        # Add connection pool settings for production
        engine_kwargs = {
            "pool_pre_ping": True,  # Verify connections before use
            "pool_recycle": 300,    # Recycle connections every 5 minutes
        }

        # Add SSL settings for production
        if os.getenv("ENVIRONMENT") == "production":
            engine_kwargs["connect_args"] = {"sslmode": "require"}

        get_engine._engine = create_engine(database_url, **engine_kwargs)
    return get_engine._engine

def get_db():
    """Get database session."""
    db = Session(get_engine())
    try:
        yield db
    finally:
        db.close()

# To create tables, call SQLModel.metadata.create_all(get_engine()) in main
