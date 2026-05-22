from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from api.db.models.test_script_bundle import TestScriptBundleStatus


class TestScriptBundleRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    version: int
    status: TestScriptBundleStatus
    framework: str | None
    language: str | None
    test_count: int | None
    manifest: dict[str, Any] | None
    sandbox_task_id: str | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
