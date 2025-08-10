from typing import Optional, List
from datetime import datetime
from sqlmodel import Field, SQLModel, Relationship

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, max_length=50)
    email: str = Field(index=True, unique=True, max_length=100)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)
    last_seen: Optional[datetime] = Field(default=None)

    # Relationships
    sent_messages: List["Message"] = Relationship(back_populates="sender", sa_relationship_kwargs={"foreign_keys": "Message.sender_id"})
    received_messages: List["Message"] = Relationship(back_populates="receiver", sa_relationship_kwargs={"foreign_keys": "Message.receiver_id"})

class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str = Field(max_length=1000)
    sender_id: int = Field(foreign_key="user.id")
    receiver_id: int = Field(foreign_key="user.id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    is_read: bool = Field(default=False)
    message_type: str = Field(default="text")  # text, image, file, etc.

    # Relationships
    sender: User = Relationship(back_populates="sent_messages")
    receiver: User = Relationship(back_populates="received_messages")

class Call(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    caller_id: int = Field(foreign_key="user.id")
    callee_id: int = Field(foreign_key="user.id")
    call_type: str = Field(max_length=20)  # audio, video
    status: str = Field(max_length=20)  # ringing, active, ended, missed
    start_time: Optional[datetime] = Field(default=None)
    end_time: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[int] = Field(default=None)

    # Relationships
    caller: User = Relationship(sa_relationship_kwargs={"foreign_keys": "user.id"})
    callee: User = Relationship(sa_relationship_kwargs={"foreign_keys": "user.id"})

class Payment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sender_id: int = Field(foreign_key="user.id")
    recipient_id: int = Field(foreign_key="user.id")
    amount_cents: int = Field(description="Amount in cents")
    currency: str = Field(default="USD", max_length=3)
    stripe_payment_intent_id: str = Field(unique=True, index=True)
    status: str = Field(max_length=20)  # pending, succeeded, failed
    description: Optional[str] = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)

    # Relationships
    sender: User = Relationship(sa_relationship_kwargs={"foreign_keys": "user.id"})
    recipient: User = Relationship(sa_relationship_kwargs={"foreign_keys": "user.id"})

class UserSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    session_token: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    is_active: bool = Field(default=True)
    ip_address: Optional[str] = Field(default=None)
    user_agent: Optional[str] = Field(default=None)

    # Relationships
    user: User = Relationship()
