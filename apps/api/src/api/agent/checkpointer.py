from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import psycopg
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from api.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def get_checkpointer() -> AsyncGenerator[AsyncPostgresSaver, None]:
    """Yield an AsyncPostgresSaver connected to Postgres.

    Usage::

        async with get_checkpointer() as checkpointer:
            graph = build_graph(checkpointer)
            ...
    """
    async with await psycopg.AsyncConnection.connect(
        settings.database_url,
        autocommit=True,
    ) as conn:
        checkpointer = AsyncPostgresSaver(conn)
        await checkpointer.setup()
        yield checkpointer


async def create_checkpointer() -> AsyncPostgresSaver:
    """Create a long-lived checkpointer backed by a connection pool.

    The caller is responsible for closing the pool when done.
    """
    from psycopg_pool import AsyncConnectionPool

    pool = AsyncConnectionPool(
        conninfo=settings.database_url,
        max_size=10,
        kwargs={"autocommit": True},
        open=False,
    )
    await pool.open()

    checkpointer = AsyncPostgresSaver(pool)  # type: ignore[arg-type]
    await checkpointer.setup()
    logger.info("Postgres checkpointer initialised")
    return checkpointer, pool  # type: ignore[return-value]
