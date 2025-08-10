from sqlmodel import create_engine, Session

import os

from dotenv import load_dotenv

load_dotenv()

def get_database_url():
    """Get database URL from environment variables."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")
    return database_url

def get_engine():
    """Get database engine, creating it if necessary."""
    if not hasattr(get_engine, '_engine'):
        database_url = get_database_url()
        get_engine._engine = create_engine(database_url)
    return get_engine._engine

def get_db():
    """Get database session."""
    db = Session(get_engine())
    try:
        yield db
    finally:
        db.close()

# To create tables, call SQLModel.metadata.create_all(get_engine()) in main
