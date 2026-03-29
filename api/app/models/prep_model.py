from sqlmodel import SQLModel, Field, Column, JSON
from datetime import datetime, timezone
from typing import Dict, Any


class Prep(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    dump_id: int = Field(foreign_key="dump.id", index=True)
    title: str
    result: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.now(timezone.utc))
    updated_at: datetime = Field(
        default_factory=datetime.now(timezone.utc),
        sa_column_kwargs={"onupdate": datetime.now(timezone.utc)},
    )
