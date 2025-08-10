import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.pool import StaticPool
from app.main import app
from app.database import get_db
from app.models import User, Message, Call, Payment
from app.routers.auth import get_password_hash

# Create in-memory database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Override the database dependency
def override_get_db():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_database():
    """Set up database before each test"""
    SQLModel.metadata.create_all(engine)
    yield
    SQLModel.metadata.drop_all(engine)

@pytest.fixture
def test_user():
    """Create a test user"""
    with Session(engine) as session:
        user = User(
            username="testuser",
            email="test@example.com",
            hashed_password=get_password_hash("testpassword")
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

@pytest.fixture
def test_user2():
    """Create a second test user"""
    with Session(engine) as session:
        user = User(
            username="testuser2",
            email="test2@example.com",
            hashed_password=get_password_hash("testpassword2")
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

def test_read_root():
    """Test the root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"Hello": "World"}

def test_debug_info():
    """Test the debug endpoint"""
    response = client.get("/debug")
    assert response.status_code == 200
    data = response.json()
    assert "database_url_set" in data
    assert "secret_key_set" in data
    assert "stripe_key_set" in data

# Authentication Tests
def test_user_registration():
    """Test user registration"""
    user_data = {
        "username": "newuser",
        "email": "new@example.com",
        "password": "newpassword"
    }
    response = client.post("/auth/register", json=user_data)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == user_data["username"]
    assert data["email"] == user_data["email"]
    assert "id" in data

def test_user_registration_duplicate_username(test_user):
    """Test registration with duplicate username"""
    user_data = {
        "username": "testuser",  # Same as test_user
        "email": "different@example.com",
        "password": "password"
    }
    response = client.post("/auth/register", json=user_data)
    assert response.status_code == 400
    assert "Username already registered" in response.json()["detail"]

def test_user_login(test_user):
    """Test user login"""
    form_data = {
        "username": "testuser",
        "password": "testpassword"
    }
    response = client.post("/auth/token", data=form_data)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_user_login_invalid_password(test_user):
    """Test login with invalid password"""
    form_data = {
        "username": "testuser",
        "password": "wrongpassword"
    }
    response = client.post("/auth/token", data=form_data)
    assert response.status_code == 401

# User Management Tests
def test_get_current_user_profile(test_user):
    """Test getting current user profile"""
    # First login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == test_user.username
    assert data["email"] == test_user.email

def test_update_user_profile(test_user):
    """Test updating user profile"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    update_data = {"username": "updateduser"}
    response = client.put("/users/me", json=update_data, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "updateduser"

def test_search_users(test_user, test_user2):
    """Test user search functionality"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/users/search?query=testuser2", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["username"] == "testuser2"

# Chat Tests
def test_send_message(test_user, test_user2):
    """Test sending a message"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    message_data = {
        "content": "Hello, this is a test message",
        "receiver_id": test_user2.id
    }
    response = client.post("/chat/send", json=message_data, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == message_data["content"]
    assert data["sender_id"] == test_user.id
    assert data["receiver_id"] == test_user2.id

def test_get_messages(test_user, test_user2):
    """Test getting conversation messages"""
    # First send a message
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}

    # Send message
    message_data = {
        "content": "Test message",
        "receiver_id": test_user2.id
    }
    client.post("/chat/send", json=message_data, headers=headers)

    # Get messages
    response = client.get(f"/chat/messages/{test_user2.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["content"] == "Test message"

def test_get_conversations(test_user, test_user2):
    """Test getting user conversations"""
    # First send a message
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}

    # Send message
    message_data = {
        "content": "Test message",
        "receiver_id": test_user2.id
    }
    client.post("/chat/send", json=message_data, headers=headers)

    # Get conversations
    response = client.get("/chat/conversations", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == test_user2.id

# Call Tests
def test_initiate_call(test_user, test_user2):
    """Test initiating a call"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    call_data = {
        "recipient_id": test_user2.id,
        "call_type": "audio"
    }
    response = client.post("/call/initiate", json=call_data, headers=headers)
    assert response.status_code == 400  # Should fail because user2 is not "online"
    assert "not online" in response.json()["detail"]

def test_get_active_calls(test_user):
    """Test getting active calls"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/call/active", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

# Payment Tests
def test_create_payment_intent(test_user, test_user2):
    """Test creating a payment intent"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    payment_data = {
        "amount": 1000,  # $10.00
        "recipient_id": test_user2.id,
        "description": "Test payment"
    }
    response = client.post("/payment/create-intent", json=payment_data, headers=headers)
    # Should fail without Stripe API key
    assert response.status_code == 500
    assert "Stripe API key not configured" in response.json()["detail"]

def test_get_transaction_history(test_user):
    """Test getting transaction history"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/payment/transactions", headers=headers)
    # Should fail without Stripe API key
    assert response.status_code == 500
    assert "Stripe API key not configured" in response.json()["detail"]

def test_get_user_balance(test_user):
    """Test getting user balance"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/payment/balance", headers=headers)
    # Should fail without Stripe API key
    assert response.status_code == 500
    assert "Stripe API key not configured" in response.json()["detail"]

# Error Handling Tests
def test_unauthorized_access():
    """Test accessing protected endpoints without authentication"""
    response = client.get("/users/me")
    assert response.status_code == 401

def test_invalid_user_id():
    """Test accessing non-existent user"""
    # Login to get token
    login_response = client.post("/auth/token", data={
        "username": "testuser",
        "password": "testpassword"
    })
    token = login_response.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/users/999", headers=headers)
    assert response.status_code == 404
    assert "User not found" in response.json()["detail"]
