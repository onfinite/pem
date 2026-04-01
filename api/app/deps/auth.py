"""Auth dependencies: Clerk JWT → `User`."""

from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose.exceptions import JWTError
from sqlmodel import Session

from app.core.clerk_jwt import verify_clerk_token
from app.core.config import settings
from app.core.database import get_session
from app.models import User
from app.services.user_service import get_user_by_clerk_id

security = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session),
) -> User:
    if not settings.clerk_jwks_url or not settings.clerk_jwt_issuer:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured on the server",
        )
    try:
        claims = verify_clerk_token(credentials.credentials)
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured on the server",
        ) from None
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token") from None

    clerk_id = claims.get("sub")
    if not clerk_id or not isinstance(clerk_id, str):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = get_user_by_clerk_id(session, clerk_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User inactive")
    return user
