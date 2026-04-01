"""Clerk Svix webhooks → local user sync."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, Request
from sqlmodel import Session
from starlette.concurrency import run_in_threadpool
from svix.webhooks import Webhook, WebhookVerificationError

from app.core.config import settings
from app.core.database import engine
from app.services.user_service import delete_user_by_clerk_id, upsert_user_from_clerk

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["webhooks"])


def _primary_email(data: dict) -> str | None:
    addresses = data.get("email_addresses") or []
    if not addresses:
        return None
    first = addresses[0]
    if isinstance(first, dict):
        return first.get("email_address")
    return None


def _full_name(data: dict) -> str | None:
    parts = [
        (data.get("first_name") or "").strip(),
        (data.get("last_name") or "").strip(),
    ]
    joined = " ".join(p for p in parts if p)
    return joined or None


def _process_clerk_event(payload: dict) -> None:
    """Run all DB work in the same thread as the Session (see run_in_threadpool)."""
    event_type = payload.get("type")
    raw = payload.get("data") or {}
    data = raw if isinstance(raw, dict) else {}
    is_prod = settings.env == "prod"

    with Session(engine) as session:
        if event_type == "user.created":
            clerk_id = data.get("id")
            if not clerk_id:
                raise ValueError("Missing user id")
            upsert_user_from_clerk(
                session,
                clerk_id=clerk_id,
                email=_primary_email(data),
                full_name=_full_name(data),
            )
            if not is_prod:
                logger.info("clerk_user_created", clerk_id=clerk_id)

        elif event_type == "user.deleted":
            clerk_id = data.get("id")
            if not clerk_id:
                raise ValueError("Missing user id")
            deleted = delete_user_by_clerk_id(session, clerk_id)
            if not is_prod:
                logger.info("clerk_user_deleted", clerk_id=clerk_id, deleted=deleted)

        else:
            if not is_prod:
                logger.debug("clerk_webhook_unhandled", event_type=event_type)


@router.post("/webhooks/clerk")
async def clerk_webhook(request: Request):
    if not settings.clerk_webhook_secret:
        raise HTTPException(
            status_code=503,
            detail="Clerk webhook is not configured",
        )

    svix_id = request.headers.get("svix-id")
    svix_timestamp = request.headers.get("svix-timestamp")
    svix_signature = request.headers.get("svix-signature")
    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Missing Svix headers")

    body = await request.body()
    wh = Webhook(settings.clerk_webhook_secret)
    try:
        payload = wh.verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError:
        logger.warning("clerk_webhook_invalid_signature")
        raise HTTPException(status_code=400, detail="Invalid signature") from None

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload shape")

    event_type = payload.get("type")
    logger.info(
        "clerk_webhook_received",
        event_type=event_type,
        svix_id=svix_id,
    )

    try:
        await run_in_threadpool(_process_clerk_event, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    except Exception:
        logger.exception("clerk_webhook_handler_failed")
        raise

    return {"status": "ok"}
