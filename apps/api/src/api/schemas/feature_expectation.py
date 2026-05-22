from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from api.db.models.feature_expectation import FeatureExpectationStatus


class FeatureExpectationRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    version: int
    content: dict[str, Any]
    status: FeatureExpectationStatus
    feedback: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
