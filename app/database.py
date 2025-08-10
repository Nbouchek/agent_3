from sqlmodel import create_engine, Session

import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/db")  # Set actual in .env

engine = create_engine(DATABASE_URL)

def get_db():

    db = Session(engine)

    try:

        yield db

    finally:

        db.close()

# To create tables, call SQLModel.metadata.create_all(engine) in main
