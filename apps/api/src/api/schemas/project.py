from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str
    problem_statement: str
    target_users: str | None = None
    tech_stack: str | None = None
    additional_context: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    problem_statement: str | None = None
    target_users: str | None = None
    tech_stack: str | None = None
    additional_context: str | None = None


class ProjectRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    problem_statement: str
    target_users: str | None
    tech_stack: str | None
    additional_context: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
