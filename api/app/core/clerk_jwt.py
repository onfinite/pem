"""Verify Clerk session JWTs using JWKS (RS256)."""

from __future__ import annotations

import time
from typing import Any

import httpx
import structlog
from jose import jwk, jwt
from jose.exceptions import JWTError

from app.core.config import settings

logger = structlog.get_logger(__name__)

_JWKS_CACHE_TTL_SEC = 600
_jwks_cache: dict[str, Any] | None = None
_jwks_cache_expires: float = 0.0


def _fetch_jwks() -> dict[str, Any]:
    global _jwks_cache, _jwks_cache_expires
    now = time.monotonic()
    if _jwks_cache is not None and now < _jwks_cache_expires:
        return _jwks_cache

    if not settings.clerk_jwks_url:
        raise RuntimeError("clerk_jwks_url is not configured")

    with httpx.Client(timeout=10.0) as client:
        response = client.get(settings.clerk_jwks_url)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_expires = now + _JWKS_CACHE_TTL_SEC
    return _jwks_cache


def _key_for_token(token: str, jwks: dict[str, Any]) -> Any:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return jwk.construct(key)
    raise JWTError("No matching JWK for token")


def verify_clerk_token(token: str) -> dict[str, Any]:
    """Decode and verify a Clerk-issued Bearer token; returns JWT claims."""
    if not settings.clerk_jwt_issuer:
        raise RuntimeError("clerk_jwt_issuer is not configured")

    jwks = _fetch_jwks()
    key = _key_for_token(token, jwks)
    try:
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.clerk_jwt_issuer,
            options={"verify_aud": False},
        )
    except JWTError as e:
        logger.debug("clerk_jwt_invalid", error=str(e))
        raise
