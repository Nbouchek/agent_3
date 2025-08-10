from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from database import get_db
from models import User
from routers.auth import get_current_user
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/users", tags=["users"])

class UserProfile(BaseModel):
    id: int
    username: str
    email: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None

class UserSearch(BaseModel):
    id: int
    username: str

@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Get current user's profile information.

    Args:
        current_user (User): Current authenticated user

    Returns:
        UserProfile: Current user's profile
    """
    return UserProfile(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email
    )

@router.put("/me", response_model=UserProfile)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile information.

    Args:
        user_update (UserUpdate): Updated user information
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        UserProfile: Updated user profile
    """
    # Check if username is being changed and if it's already taken
    if user_update.username and user_update.username != current_user.username:
        existing_user = db.exec(select(User).where(User.username == user_update.username)).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = user_update.username

    # Check if email is being changed and if it's already taken
    if user_update.email and user_update.email != current_user.email:
        existing_user = db.exec(select(User).where(User.email == user_update.email)).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = user_update.email

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return UserProfile(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email
    )

@router.get("/search", response_model=List[UserSearch])
async def search_users(
    query: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 20
):
    """
    Search for users by username.

    Args:
        query (str): Search query (username)
        current_user (User): Current authenticated user
        db (Session): Database session
        limit (int): Maximum number of results

    Returns:
        List[UserSearch]: List of matching users
    """
    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

    # Search for users whose username contains the query
    users = db.exec(
        select(User).where(
            User.username.contains(query) & (User.id != current_user.id)
        ).limit(limit)
    ).all()

    return [
        UserSearch(id=user.id, username=user.username)
        for user in users
    ]

@router.get("/{user_id}", response_model=UserSearch)
async def get_user_by_id(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user information by ID.

    Args:
        user_id (int): ID of the user to retrieve
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        UserSearch: User information
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Use /users/me to get your own profile")

    user = db.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserSearch(id=user.id, username=user.username)

@router.get("/online/list")
async def get_online_users(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of currently online users.

    Args:
        current_user (User): Current authenticated user

    Returns:
        List[dict]: List of online users
    """
    # This would integrate with the WebSocket managers to get online users
    # For now, return a placeholder
    # TODO: Integrate with chat and call managers to get actual online users

    return {
        "message": "Online users feature not yet implemented",
        "online_count": 0,
        "users": []
    }

@router.get("/stats")
async def get_user_statistics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user statistics (message count, etc.).

    Args:
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        dict: User statistics
    """
    # TODO: Implement actual statistics
    # This would count messages, calls, payments, etc.

    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "joined_date": "2025-01-01",  # TODO: Add to User model
        "message_count": 0,  # TODO: Count from Message model
        "call_count": 0,     # TODO: Count from call history
        "payment_count": 0   # TODO: Count from payment history
    }
