from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from api.db.models.test_scenario import TestScenarioStatus


class TestScenarioCreate(BaseModel):
    title: str
    feature_description: str
    user_story: str
    acceptance_criteria: str


class TestScenarioUpdate(BaseModel):
    title: str | None = None
    feature_description: str | None = None
    user_story: str | None = None
    acceptance_criteria: str | None = None


class TestScenarioRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    feature_description: str
    user_story: str
    acceptance_criteria: str
    status: TestScenarioStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
