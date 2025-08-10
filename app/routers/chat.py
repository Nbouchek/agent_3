from fastapi import APIRouter, WebSocket, Depends, HTTPException, status
from typing import List, Dict
from starlette.websockets import WebSocketDisconnect
from sqlmodel import Session, select
from database import get_db
from models import User, Message
from routers.auth import get_current_user
from pydantic import BaseModel
from datetime import datetime
import json

router = APIRouter(prefix="/chat", tags=["chat"])

class MessageCreate(BaseModel):
    content: str
    receiver_id: int

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception as e:
                print(f"Error sending message to user {user_id}: {e}")
                # Remove broken connection
                self.disconnect(user_id)

    async def broadcast_to_user(self, message: dict, user_ids: List[int]):
        """Send message to specific users"""
        for user_id in user_ids:
            if user_id in self.active_connections:
                await self.send_personal_message(message, user_id)

manager = ConnectionManager()

@router.post("/send", response_model=Message)
async def send_message(
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a message to another user.

    Args:
        message (MessageCreate): Message content and recipient
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        Message: Created message
    """
    # Validate recipient exists
    recipient = db.exec(select(User).where(User.id == message.receiver_id)).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Create and save message
    db_message = Message(
        content=message.content,
        sender_id=current_user.id,
        receiver_id=message.receiver_id,
        timestamp=datetime.utcnow()
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)

    # Send real-time message if recipient is online
    real_time_message = {
        "type": "new_message",
        "message": {
            "id": db_message.id,
            "content": db_message.content,
            "sender_id": db_message.sender_id,
            "receiver_id": db_message.receiver_id,
            "timestamp": db_message.timestamp.isoformat(),
            "sender_username": current_user.username
        }
    }

    await manager.send_personal_message(real_time_message, message.receiver_id)

    return db_message

@router.get("/messages/{user_id}", response_model=List[Message])
async def get_messages(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get conversation messages between current user and another user.

    Args:
        user_id (int): ID of the other user
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        List[Message]: List of messages
    """
    # Get messages between the two users (both directions)
    messages = db.exec(
        select(Message).where(
            ((Message.sender_id == current_user.id) & (Message.receiver_id == user_id)) |
            ((Message.sender_id == user_id) & (Message.receiver_id == current_user.id))
        ).order_by(Message.timestamp)
    ).all()

    return messages

@router.get("/conversations", response_model=List[dict])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get list of users the current user has conversations with.

    Args:
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        List[dict]: List of conversation partners with last message info
    """
    # Get unique conversation partners
    conversations = db.exec(
        select(Message).where(
            (Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id)
        ).order_by(Message.timestamp.desc())
    ).all()

    # Group by conversation partner and get latest message
    conversation_map = {}
    for msg in conversations:
        other_user_id = msg.sender_id if msg.sender_id != current_user.id else msg.receiver_id

        if other_user_id not in conversation_map or msg.timestamp > conversation_map[other_user_id]["last_message_time"]:
            conversation_map[other_user_id] = {
                "user_id": other_user_id,
                "last_message": msg.content,
                "last_message_time": msg.timestamp,
                "unread_count": 0  # TODO: Implement unread count
            }

    return list(conversation_map.values())

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """
    WebSocket endpoint for real-time messaging.

    Args:
        websocket (WebSocket): WebSocket connection
        user_id (int): ID of the connecting user
    """
    await manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message_data = json.loads(data)
                message_type = message_data.get("type")

                if message_type == "ping":
                    # Keep connection alive
                    await websocket.send_json({"type": "pong"})
                elif message_type == "typing":
                    # Handle typing indicators
                    recipient_id = message_data.get("recipient_id")
                    if recipient_id:
                        await manager.send_personal_message({
                            "type": "typing",
                            "user_id": user_id
                        }, recipient_id)

            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})

    except WebSocketDisconnect:
        manager.disconnect(user_id)
        print(f"User {user_id} disconnected from chat")
