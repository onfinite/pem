"""User persistence helpers (Clerk sync, lookups)."""

from __future__ import annotations

import structlog
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models import Dump, Prep, User

logger = structlog.get_logger(__name__)


def get_user_by_clerk_id(session: Session, clerk_id: str) -> User | None:
    stmt = select(User).where(User.clerk_id == clerk_id)
    return session.exec(stmt).first()


def get_user_by_email(session: Session, email: str) -> User | None:
    stmt = select(User).where(User.email == email)
    return session.exec(stmt).first()


def upsert_user_from_clerk(
    session: Session,
    *,
    clerk_id: str,
    email: str | None,
    full_name: str | None,
) -> User:
    """Create or update a user from Clerk `user.created` / idempotent retries."""
    existing = get_user_by_clerk_id(session, clerk_id)
    if existing:
        changed = False
        if email is not None and existing.email != email:
            existing.email = email
            changed = True
        if full_name is not None and existing.full_name != full_name:
            existing.full_name = full_name
            changed = True
        if changed:
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return existing

    # Same email, new Clerk user id (account recreated) — keep one row, update clerk_id.
    if email:
        by_email = get_user_by_email(session, email)
        if by_email is not None and by_email.clerk_id != clerk_id:
            by_email.clerk_id = clerk_id
            if full_name is not None:
                by_email.full_name = full_name
            session.add(by_email)
            session.commit()
            session.refresh(by_email)
            logger.info("user_relinked_clerk_id", clerk_id=clerk_id)
            return by_email

    user = User(
        clerk_id=clerk_id,
        email=email,
        full_name=full_name,
        is_active=True,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        race = get_user_by_clerk_id(session, clerk_id)
        if race is not None:
            return upsert_user_from_clerk(
                session,
                clerk_id=clerk_id,
                email=email,
                full_name=full_name,
            )
        if email:
            again = get_user_by_email(session, email)
            if again is not None:
                again.clerk_id = clerk_id
                if full_name is not None:
                    again.full_name = full_name
                session.add(again)
                session.commit()
                session.refresh(again)
                logger.info("user_relinked_clerk_id_after_race", clerk_id=clerk_id)
                return again
        logger.warning("user_create_integrity_conflict_unresolved", clerk_id=clerk_id)
        raise
    session.refresh(user)
    return user


def delete_user_by_clerk_id(session: Session, clerk_id: str) -> bool:
    """Remove user and dependent rows (preps reference dumps — delete preps first)."""
    user = get_user_by_clerk_id(session, clerk_id)
    if user is None:
        return False

    preps = session.exec(select(Prep).where(Prep.user_id == user.id)).all()
    dumps = session.exec(select(Dump).where(Dump.user_id == user.id)).all()
    for p in preps:
        session.delete(p)
    for d in dumps:
        session.delete(d)
    session.delete(user)
    session.commit()
    return True
