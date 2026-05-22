"""add error column to runs

Revision ID: 0002_run_error_column
Revises: 801ad41194fd
Create Date: 2026-05-22 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision: str = "0002_run_error_column"
down_revision: Union[str, Sequence[str], None] = "801ad41194fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add `runs.error` for surfacing graph crashes / sandbox failures."""
    op.add_column(
        "runs",
        sa.Column("error", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("runs", "error")
