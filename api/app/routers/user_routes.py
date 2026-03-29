from fastapi import Depends, APIRouter
from sqlmodel import Session
from app.core.database import get_session


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def get_current_user(session: Session = Depends(get_session)):
    # Placeholder for actual user retrieval logic
    return {"user": "current_user"}
