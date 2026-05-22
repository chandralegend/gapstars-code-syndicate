"""add test_script_bundles table

Revision ID: 0003_test_script_bundles
Revises: 0002_run_error_column
Create Date: 2026-05-22 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_test_script_bundles"
down_revision: Union[str, Sequence[str], None] = "0002_run_error_column"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the table that backs Agent 4's per-run script bundles."""
    op.create_table(
        "test_script_bundles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("framework", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("language", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("test_count", sa.Integer(), nullable=True),
        sa.Column("manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "sandbox_task_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
        sa.Column("error", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_test_script_bundles_run_id",
        "test_script_bundles",
        ["run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_test_script_bundles_run_id", table_name="test_script_bundles"
    )
    op.drop_table("test_script_bundles")
