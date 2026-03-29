from sqlmodel import SQLModel, Field, Column, JSON
from datetime import datetime, timezone
from typing import Dict, Any


class User(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    clerk_id: str = Field(unique=True, index=True)
    email: str | None = Field(unique=True)
    full_name: str | None = None
    is_active: bool = True
    user_data: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.now(timezone.utc))
    updated_at: datetime = Field(
        default_factory=datetime.now(timezone.utc),
        sa_column_kwargs={"onupdate": datetime.now(timezone.utc)},
    )
