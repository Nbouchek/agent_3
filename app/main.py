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
