from fastapi import APIRouter, WebSocket

from starlette.websockets import WebSocketDisconnect

from typing import Dict

router = APIRouter(prefix="/call", tags=["call"])

class SignalingManager:
    def __init__(self):
        self.connections: Dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections[user_id] = websocket

    def disconnect(self, user_id: int):
        if user_id in self.connections:
            del self.connections[user_id]

    async def send_message(self, user_id: int, message: dict):
        if user_id in self.connections:
            await self.connections[user_id].send_json(message)

manager = SignalingManager()

@router.websocket("/signal/{user_id}")
async def signaling(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            recipient = data.get("recipient")
            if recipient:
                await manager.send_message(recipient, data)
    except WebSocketDisconnect:
        manager.disconnect(user_id)
