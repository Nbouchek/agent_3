import os
import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from app.routers.auth import get_current_user
from app.models import User
from app.database import get_db
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/payment", tags=["payment"])

class PaymentRequest(BaseModel):
    amount: int  # Amount in cents
    recipient_id: int
    description: Optional[str] = None

class PaymentResponse(BaseModel):
    client_secret: str
    payment_intent_id: str
    amount: int
    recipient_id: int

class TransactionHistory(BaseModel):
    id: str
    amount: int
    currency: str
    status: str
    created: int
    description: Optional[str]
    recipient_id: Optional[int]
    sender_id: Optional[int]

@router.post("/create-intent", response_model=PaymentResponse)
async def create_payment_intent(
    request: PaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a payment intent for sending money to another user.

    Args:
        request (PaymentRequest): Payment details
        current_user (User): Current authenticated user
        db (Session): Database session

    Returns:
        PaymentResponse: Payment intent details
    """
    # Explicitly set the key right before use to avoid import issues
    stripe.api_key = os.getenv("STRIPE_API_KEY")

    # Validate amount
    if request.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Amount must be greater than 0"
        )

    if request.amount > 1000000:  # $10,000 limit
        raise HTTPException(
            status_code=400,
            detail="Amount exceeds maximum limit"
        )

    # Validate recipient exists
    recipient = db.exec(select(User).where(User.id == request.recipient_id)).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    if request.recipient_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send money to yourself")

    try:
        # Create payment intent with metadata for tracking
        intent = stripe.PaymentIntent.create(
            amount=request.amount,
            currency="usd",
            description=request.description or f"Payment to {recipient.username}",
            metadata={
                "sender_id": str(current_user.id),
                "sender_username": current_user.username,
                "recipient_id": str(request.recipient_id),
                "recipient_username": recipient.username,
                "payment_type": "p2p"
            },
            receipt_email=current_user.email,
        )

        return PaymentResponse(
            client_secret=intent.client_secret,
            payment_intent_id=intent.id,
            amount=request.amount,
            recipient_id=request.recipient_id
        )

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment creation failed: {str(e)}")

@router.post("/confirm/{payment_intent_id}")
async def confirm_payment(
    payment_intent_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Confirm a payment (for frontend to call after successful payment).

    Args:
        payment_intent_id (str): Stripe payment intent ID
        current_user (User): Current authenticated user

    Returns:
        dict: Confirmation details
    """
    try:
        # Retrieve the payment intent
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)

        # Verify this payment belongs to the current user
        if intent.metadata.get("sender_id") != str(current_user.id):
            raise HTTPException(status_code=403, detail="Payment does not belong to user")

        # Check if payment was successful
        if intent.status == "succeeded":
            return {
                "status": "success",
                "amount": intent.amount,
                "recipient_id": intent.metadata.get("recipient_id"),
                "message": "Payment completed successfully"
            }
        else:
            return {
                "status": intent.status,
                "message": f"Payment status: {intent.status}"
            }

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment confirmation failed: {str(e)}")

@router.get("/transactions", response_model=List[TransactionHistory])
async def get_transaction_history(
    current_user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0
):
    """
    Get transaction history for the current user.

    Args:
        current_user (User): Current authenticated user
        limit (int): Maximum number of transactions to return
        offset (int): Number of transactions to skip

    Returns:
        List[TransactionHistory]: List of transactions
    """
    try:
        # Get payments sent by the user
        sent_payments = stripe.PaymentIntent.list(
            limit=limit,
            offset=offset,
            metadata={"sender_id": str(current_user.id)}
        )

        # Get payments received by the user (if using Stripe Connect)
        # For MVP, we'll only show sent payments
        transactions = []

        for payment in sent_payments.data:
            transactions.append(TransactionHistory(
                id=payment.id,
                amount=payment.amount,
                currency=payment.currency,
                status=payment.status,
                created=payment.created,
                description=payment.description,
                recipient_id=int(payment.metadata.get("recipient_id", 0)) if payment.metadata.get("recipient_id") else None,
                sender_id=current_user.id
            ))

        # Sort by creation date (newest first)
        transactions.sort(key=lambda x: x.created, reverse=True)

        return transactions

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

@router.get("/balance")
async def get_user_balance(current_user: User = Depends(get_current_user)):
    """
    Get user's payment balance/statistics.

    Args:
        current_user (User): Current authenticated user

    Returns:
        dict: User's payment statistics
    """
    try:
        # Get total amount sent
        sent_payments = stripe.PaymentIntent.list(
            metadata={"sender_id": str(current_user.id)},
            status="succeeded"
        )

        total_sent = sum(payment.amount for payment in sent_payments.data)

        # Get recent activity
        recent_transactions = stripe.PaymentIntent.list(
            metadata={"sender_id": str(current_user.id)},
            limit=5,
            status="succeeded"
        )

        return {
            "total_sent_cents": total_sent,
            "total_sent_dollars": total_sent / 100,
            "total_transactions": len(sent_payments.data),
            "recent_transactions": [
                {
                    "id": payment.id,
                    "amount": payment.amount,
                    "recipient": payment.metadata.get("recipient_username", "Unknown"),
                    "date": datetime.fromtimestamp(payment.created).isoformat()
                }
                for payment in recent_transactions.data
            ]
        }

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve balance: {str(e)}")

@router.post("/webhook")
async def stripe_webhook():
    """
    Handle Stripe webhooks for payment events.
    This endpoint should be configured in Stripe dashboard.

    Returns:
        dict: Webhook response
    """
    # TODO: Implement webhook signature verification
    # TODO: Handle payment success/failure events
    # TODO: Update user balances, send notifications, etc.

    return {"status": "webhook received"}
