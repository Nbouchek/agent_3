from sqlmodel import create_engine, Session

import os

from dotenv import load_dotenv

load_dotenv()

# On Render, DATABASE_URL must be provided via environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

engine = create_engine(DATABASE_URL)

def get_db():
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()

# To create tables, call SQLModel.metadata.create_all(engine) in main
