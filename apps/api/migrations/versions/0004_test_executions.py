"""add test_executions and test_execution_results tables

Revision ID: 0004_test_executions
Revises: 0003_test_script_bundles
Create Date: 2026-05-24 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_test_executions"
down_revision: Union[str, Sequence[str], None] = "0003_test_script_bundles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the tables that back actual test-suite executions.

    A `test_execution` is one invocation of `bundle/run.sh` against a
    given bundle. It rolls up the suite-level outcome (passed / failed
    / errored) plus duration and a summary of pass/fail counts.

    Each per-test outcome inside the suite gets its own row in
    `test_execution_results`. We split rather than nesting in JSONB so
    flake-detection and "show me all failures of test X across N runs"
    are straightforward SQL queries later.
    """
    op.create_table(
        "test_executions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("bundle_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="queued",
        ),
        sa.Column(
            "trigger",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="auto",
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "sandbox_task_id",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
        sa.Column("error", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["bundle_id"], ["test_script_bundles.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_test_executions_run_id",
        "test_executions",
        ["run_id"],
        unique=False,
    )
    op.create_index(
        "ix_test_executions_bundle_id",
        "test_executions",
        ["bundle_id"],
        unique=False,
    )
    # The most common query is "give me the latest execution for this
    # run", so a composite (run_id, created_at desc) helps that path.
    op.create_index(
        "ix_test_executions_run_id_created_at",
        "test_executions",
        ["run_id", sa.text("created_at DESC")],
        unique=False,
    )

    op.create_table(
        "test_execution_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("execution_id", sa.Uuid(), nullable=False),
        sa.Column(
            "test_id",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        # Soft link back to the test_case row when the bundle's manifest
        # records the originating test_case_id. Null when the test was
        # added by the bundle generator without a 1:1 mapping.
        sa.Column("test_case_id", sa.Uuid(), nullable=True),
        sa.Column(
            "outcome",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("failure_trace", sa.Text(), nullable=True),
        sa.Column(
            "screenshot_path",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["execution_id"], ["test_executions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["test_case_id"], ["test_cases.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_test_execution_results_execution_id",
        "test_execution_results",
        ["execution_id"],
        unique=False,
    )
    op.create_index(
        "ix_test_execution_results_test_case_id",
        "test_execution_results",
        ["test_case_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_test_execution_results_test_case_id",
        table_name="test_execution_results",
    )
    op.drop_index(
        "ix_test_execution_results_execution_id",
        table_name="test_execution_results",
    )
    op.drop_table("test_execution_results")

    op.drop_index(
        "ix_test_executions_run_id_created_at", table_name="test_executions"
    )
    op.drop_index("ix_test_executions_bundle_id", table_name="test_executions")
    op.drop_index("ix_test_executions_run_id", table_name="test_executions")
    op.drop_table("test_executions")
