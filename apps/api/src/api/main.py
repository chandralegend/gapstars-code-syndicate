from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.agent.checkpointer import create_checkpointer
from api.agent.graph import build_graph
from api.agent.llm_factory import create_llm
from api.config import settings
from api.qa_workflow.graph import build_qa_graph
from api.db.engine import engine as db_engine
from api.routers import (
    agent_router,
    projects_router,
    providers_router,
    runs_router,
    test_scenarios_router,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: build the agent graph with a persistent checkpointer.
    Shutdown: close the connection pool.
    """
    logger.info("Starting up — initialising Postgres checkpointer…")
    checkpointer, pool = await create_checkpointer()

    # Store checkpointer so per-request graph building can reuse it
    app.state.checkpointer = checkpointer

    # Cache of compiled graphs keyed by "provider:model"
    app.state.graphs = {}

    # Pre-build the default graph so the first request isn't slow
    default_llm = create_llm()
    default_key = f"{settings.llm_provider}:{settings.default_model_for(settings.llm_provider)}"
    app.state.graphs[default_key] = build_graph(checkpointer=checkpointer, llm=default_llm)

    logger.info("Agent graph ready (default: %s)", default_key)

    # QA workflow graph (shares the same checkpointer)
    qa_llm = create_llm()
    app.state.qa_graph = build_qa_graph(checkpointer=checkpointer, llm=qa_llm)
    logger.info("QA workflow graph ready")

    yield

    logger.info("Shutting down — closing connection pool…")
    await pool.close()
    await db_engine.dispose()


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
    app.include_router(providers_router)
    app.include_router(projects_router)
    app.include_router(test_scenarios_router)
    app.include_router(runs_router)

    # ── Health ────────────────────────────────────────────────────────────────
    @app.get("/api/health", tags=["health"])
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
