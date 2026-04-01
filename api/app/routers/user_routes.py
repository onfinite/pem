from fastapi import APIRouter, Depends

from app.deps.auth import get_current_user as require_user
from app.models import User


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def get_me(user: User = Depends(require_user)):
    return {
        "id": user.id,
        "clerk_id": user.clerk_id,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
    }
