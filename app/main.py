from fastapi import FastAPI

from sqlmodel import SQLModel

from app.database import engine

from app.routers import auth, chat, call, payment

app = FastAPI()

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(call.router)
app.include_router(payment.router)

@app.on_event("startup")
def on_startup():
    try:
        SQLModel.metadata.create_all(engine)
        print("Database tables created successfully")
    except Exception as e:
        print(f"Error creating database tables: {e}")
        raise e

@app.get("/")
def read_root():
    """
    Root endpoint.

    Returns:
        dict: Greeting message.
    """
    return {"Hello": "World"}

@app.get("/debug")
def debug_info():
    """
    Debug endpoint to check environment variables.
    
    Returns:
        dict: Debug information.
    """
    import os
    return {
        "database_url_set": bool(os.getenv("DATABASE_URL")),
        "secret_key_set": bool(os.getenv("SECRET_KEY")),
        "stripe_key_set": bool(os.getenv("STRIPE_API_KEY")),
        "database_url_length": len(os.getenv("DATABASE_URL", "")) if os.getenv("DATABASE_URL") else 0
    }
