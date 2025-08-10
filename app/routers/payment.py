import os
import stripe

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel

from app.routers.auth import get_current_user

from app.models import User

router = APIRouter(prefix="/payment", tags=["payment"])

# Load Stripe API key from environment
stripe.api_key = os.getenv("STRIPE_API_KEY", "")

class PaymentRequest(BaseModel):
    amount: int
    recipient_id: int

@router.post("/create-intent")
def create_payment_intent(
    request: PaymentRequest, current_user: User = Depends(get_current_user)
):
    """
    Create a payment intent for sending money.

    Note: For full P2P, integrate Stripe Connect.

    Args:
        request (PaymentRequest): Amount and recipient.

    Returns:
        dict: Client secret for payment.
    """
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")

    try:
        # For MVP, create intent for app
        intent = stripe.PaymentIntent.create(
            amount=request.amount,
            currency="usd",
            metadata={"sender": current_user.id, "recipient": request.recipient_id},
        )
        return {"client_secret": intent["client_secret"]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
