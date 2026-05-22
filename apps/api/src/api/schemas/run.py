from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from api.db.models.run import RunStatus


class RunRead(BaseModel):
    id: uuid.UUID
    test_scenario_id: uuid.UUID
    thread_id: str
    status: RunStatus
    current_node: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
