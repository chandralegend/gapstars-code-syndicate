from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.agent.checkpointer import create_checkpointer
from api.agent.graph import build_graph
from api.config import settings
from api.routers import agent_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: build the agent graph with a persistent checkpointer.
    Shutdown: close the connection pool.
    """
    logger.info("Starting up — initialising Postgres checkpointer…")
    checkpointer, pool = await create_checkpointer()
    app.state.graph = build_graph(checkpointer=checkpointer)
    logger.info("Agent graph ready")

    yield

    logger.info("Shutting down — closing connection pool…")
    await pool.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Multi-Agent Starter API",
        version="0.1.0",
        description="FastAPI + LangGraph multi-agent backend",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(agent_router)

    # ── Health ────────────────────────────────────────────────────────────────
    @app.get("/api/health", tags=["health"])
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
