from fastapi import APIRouter, WebSocket, Depends, HTTPException, status
from starlette.websockets import WebSocketDisconnect
from typing import Dict, Optional
from sqlmodel import Session, select
from database import get_db
from models import User
from routers.auth import get_current_user
from pydantic import BaseModel
import json

router = APIRouter(prefix="/call", tags=["call"])

class CallRequest(BaseModel):
    recipient_id: int
    call_type: str  # "audio" or "video"

class CallResponse(BaseModel):
    call_id: str
    status: str

class SignalingManager:
    def __init__(self):
        self.connections: Dict[int, WebSocket] = {}
        self.active_calls: Dict[str, dict] = {}
        self.call_counter = 0

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections[user_id] = websocket
        print(f"User {user_id} connected for calls")

    def disconnect(self, user_id: int):
        if user_id in self.connections:
            del self.connections[user_id]
            print(f"User {user_id} disconnected from calls")

        # Clean up any active calls for this user
        calls_to_remove = []
        for call_id, call_data in self.active_calls.items():
            if user_id in [call_data.get("caller_id"), call_data.get("callee_id")]:
                calls_to_remove.append(call_id)

        for call_id in calls_to_remove:
            self.end_call(call_id, user_id)

    def create_call(self, caller_id: int, callee_id: int, call_type: str) -> str:
        """Create a new call session"""
        self.call_counter += 1
        call_id = f"call_{self.call_counter}_{caller_id}_{callee_id}"

        self.active_calls[call_id] = {
            "caller_id": caller_id,
            "callee_id": callee_id,
            "call_type": call_type,
            "status": "ringing",
            "start_time": None,
            "end_time": None
        }

        return call_id

    def end_call(self, call_id: str, user_id: int):
        """End a call session"""
        if call_id in self.active_calls:
            call_data = self.active_calls[call_id]
            if user_id in [call_data.get("caller_id"), call_data.get("callee_id")]:
                call_data["status"] = "ended"
                call_data["end_time"] = "now"  # TODO: Use proper timestamp
                print(f"Call {call_id} ended by user {user_id}")

    async def send_message(self, user_id: int, message: dict):
        """Send a message to a specific user"""
        if user_id in self.connections:
            try:
                await self.connections[user_id].send_json(message)
            except Exception as e:
                print(f"Error sending call message to user {user_id}: {e}")
                self.disconnect(user_id)

    async def initiate_call(self, caller_id: int, callee_id: int, call_type: str) -> str:
        """Initiate a call between two users"""
        call_id = self.create_call(caller_id, callee_id, call_type)

        # Send call request to callee
        call_request = {
            "type": "incoming_call",
            "call_id": call_id,
            "caller_id": caller_id,
            "call_type": call_type
        }
        await self.send_message(callee_id, call_request)

        return call_id

    async def handle_call_response(self, call_id: str, user_id: int, response: str):
        """Handle call response (accept/reject)"""
        if call_id not in self.active_calls:
            return

        call_data = self.active_calls[call_id]
        other_user_id = call_data["caller_id"] if user_id == call_data["callee_id"] else call_data["callee_id"]

        if response == "accept":
            call_data["status"] = "active"
            call_data["start_time"] = "now"  # TODO: Use proper timestamp

            # Notify both users that call is connected
            accept_message = {
                "type": "call_accepted",
                "call_id": call_id,
                "call_type": call_data["call_type"]
            }
            await self.send_message(other_user_id, accept_message)

        elif response == "reject":
            call_data["status"] = "rejected"
            call_data["end_time"] = "now"

            # Notify caller that call was rejected
            reject_message = {
                "type": "call_rejected",
                "call_id": call_id
            }
            await self.send_message(other_user_id, reject_message)

manager = SignalingManager()

@router.post("/initiate", response_model=CallResponse)
async def initiate_call(
    call_request: CallRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initiate a call with another user.

    Args:
        call_request (CallRequest): Call details
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        CallResponse: Call session details
    """
    # Validate recipient exists
    recipient = db.exec(select(User).where(User.id == call_request.recipient_id)).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    if call_request.recipient_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot call yourself")

    # Validate call type
    if call_request.call_type not in ["audio", "video"]:
        raise HTTPException(status_code=400, detail="Invalid call type")

    # Check if recipient is online
    if call_request.recipient_id not in manager.connections:
        raise HTTPException(status_code=400, detail="Recipient is not online")

    # Initiate the call
    call_id = await manager.initiate_call(
        current_user.id,
        call_request.recipient_id,
        call_request.call_type
    )

    return CallResponse(call_id=call_id, status="ringing")

@router.post("/respond/{call_id}")
async def respond_to_call(
    call_id: str,
    response: str,  # "accept" or "reject"
    current_user: User = Depends(get_current_user)
):
    """
    Respond to an incoming call.

    Args:
        call_id (str): ID of the call to respond to
        response (str): Response type ("accept" or "reject")
        current_user (User): Current authenticated user

    Returns:
        dict: Response confirmation
    """
    if response not in ["accept", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid response")

    await manager.handle_call_response(call_id, current_user.id, response)

    return {"message": f"Call {response}ed", "call_id": call_id}

@router.post("/end/{call_id}")
async def end_call(
    call_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    End an active call.

    Args:
        call_id (str): ID of the call to end
        current_user (User): Current authenticated user

    Returns:
        dict: Call end confirmation
    """
    manager.end_call(call_id, current_user.id)

    # Notify other participant
    if call_id in manager.active_calls:
        call_data = manager.active_calls[call_id]
        other_user_id = call_data["caller_id"] if current_user.id == call_data["callee_id"] else call_data["callee_id"]

        end_message = {
            "type": "call_ended",
            "call_id": call_id,
            "ended_by": current_user.id
        }
        await manager.send_message(other_user_id, end_message)

    return {"message": "Call ended", "call_id": call_id}

@router.get("/active")
async def get_active_calls(current_user: User = Depends(get_current_user)):
    """
    Get active calls for the current user.

    Args:
        current_user (User): Current authenticated user

    Returns:
        List[dict]: List of active calls
    """
    user_calls = []
    for call_id, call_data in manager.active_calls.items():
        if current_user.id in [call_data.get("caller_id"), call_data.get("callee_id")]:
            user_calls.append({
                "call_id": call_id,
                "caller_id": call_data["caller_id"],
                "callee_id": call_data["callee_id"],
                "call_type": call_data["call_type"],
                "status": call_data["status"]
            })

    return user_calls

@router.websocket("/signal/{user_id}")
async def signaling(websocket: WebSocket, user_id: int):
    """
    WebSocket endpoint for WebRTC signaling.

    Args:
        websocket (WebSocket): WebSocket connection
        user_id (int): ID of the connecting user
    """
    await manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "ping":
                # Keep connection alive
                await websocket.send_json({"type": "pong"})
            elif message_type == "webrtc_signal":
                # Forward WebRTC signaling to recipient
                recipient_id = data.get("recipient_id")
                if recipient_id and recipient_id in manager.connections:
                    await manager.send_message(recipient_id, {
                        "type": "webrtc_signal",
                        "sender_id": user_id,
                        "data": data.get("data", {})
                    })
            elif message_type == "call_response":
                # Handle call response
                call_id = data.get("call_id")
                response = data.get("response")
                if call_id and response:
                    await manager.handle_call_response(call_id, user_id, response)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        print(f"Error in call signaling for user {user_id}: {e}")
        manager.disconnect(user_id)
