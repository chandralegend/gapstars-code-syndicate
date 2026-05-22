from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgentEventRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    node_name: str
    event_type: str
    payload: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
