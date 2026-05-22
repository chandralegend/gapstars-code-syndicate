from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from api.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/providers", tags=["providers"])


# ── Response schemas ──────────────────────────────────────────────────────────


class ModelInfo(BaseModel):
    id: str
    name: str


class ProviderInfo(BaseModel):
    id: str
    name: str
    available: bool
    default_model: str
    models: list[ModelInfo]


class ProvidersResponse(BaseModel):
    providers: list[ProviderInfo]
    default_provider: str


# ── Model discovery helpers ───────────────────────────────────────────────────

# Chat-capable model prefixes / ids we want to surface for each provider.
_OPENAI_CHAT_PREFIXES = ("gpt-4", "gpt-3.5", "o1", "o3", "o4")
_MISTRAL_CHAT_PREFIXES = ("mistral", "mixtral", "codestral", "open-")

# Anthropic doesn't expose a public list endpoint — we maintain a curated list.
_ANTHROPIC_MODELS: list[ModelInfo] = [
    ModelInfo(id="claude-opus-4-5", name="Claude Opus 4.5"),
    ModelInfo(id="claude-sonnet-4-5", name="Claude Sonnet 4.5"),
    ModelInfo(id="claude-sonnet-4-6", name="Claude Sonnet 4.6"),
    ModelInfo(id="claude-haiku-3-5", name="Claude Haiku 3.5"),
]


def _dedupe_by_name(models: list[ModelInfo]) -> list[ModelInfo]:
    """Collapse models that share the same display name.

    Some providers (notably Mistral) expose multiple aliases for the same
    underlying model (e.g. ``mistral-large-latest`` and ``mistral-large-2512``
    both report ``name == "mistral-large-2512"``). We keep one entry per name,
    preferring an id that ends with ``-latest`` when available so the user
    picks a stable alias.
    """
    by_name: dict[str, ModelInfo] = {}
    for m in models:
        existing = by_name.get(m.name)
        if existing is None:
            by_name[m.name] = m
            continue
        # Prefer "-latest" alias over a dated revision
        if m.id.endswith("-latest") and not existing.id.endswith("-latest"):
            by_name[m.name] = m
    return list(by_name.values())


async def _fetch_openai_models() -> list[ModelInfo]:
    """Fetch chat models from the OpenAI models API."""
    if not settings.openai_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            )
            r.raise_for_status()
            data = r.json().get("data", [])

        models = [
            ModelInfo(id=m["id"], name=m["id"])
            for m in data
            if any(m["id"].startswith(p) for p in _OPENAI_CHAT_PREFIXES)
            and not any(
                x in m["id"]
                for x in (
                    "instruct",
                    "realtime",
                    "audio",
                    "search",
                    "vision",
                    "preview",
                    "transcribe",
                    "tts",
                    "image",
                )
            )
        ]
        models = _dedupe_by_name(models)
        models.sort(key=lambda m: m.id)
        return models
    except Exception:
        logger.exception("Failed to fetch OpenAI models")
        return []


async def _fetch_mistral_models() -> list[ModelInfo]:
    """Fetch chat models from the Mistral models API."""
    if not settings.mistral_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.mistral.ai/v1/models",
                headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
            )
            r.raise_for_status()
            data = r.json().get("data", [])

        models = [
            ModelInfo(id=m["id"], name=m.get("name") or m["id"])
            for m in data
            if any(m["id"].startswith(p) for p in _MISTRAL_CHAT_PREFIXES)
            and m.get("capabilities", {}).get("completion_chat", True)
            and "vibe-cli" not in m["id"]
        ]
        models = _dedupe_by_name(models)
        models.sort(key=lambda m: m.id)
        return models
    except Exception:
        logger.exception("Failed to fetch Mistral models")
        return []


async def _fetch_anthropic_models() -> list[ModelInfo]:
    """Fetch models from the Anthropic models API (or return curated fallback)."""
    if not settings.anthropic_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
            r.raise_for_status()
            data = r.json().get("data", [])

        if data:
            models = [
                ModelInfo(id=m["id"], name=m.get("display_name") or m["id"])
                for m in data
            ]
            models = _dedupe_by_name(models)
            models.sort(key=lambda m: m.id, reverse=True)
            return models
    except Exception:
        logger.exception("Failed to fetch Anthropic models — using curated list")

    # Anthropic may return 404 on the models endpoint for some key tiers;
    # fall back to the curated static list so the UI still works.
    return _ANTHROPIC_MODELS


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.get("", response_model=ProvidersResponse, summary="List available LLM providers and their models")
async def list_providers() -> ProvidersResponse:
    """Return all configured LLM providers with their dynamically discovered models."""
    openai_models = await _fetch_openai_models()
    mistral_models = await _fetch_mistral_models()
    anthropic_models = await _fetch_anthropic_models()

    providers = [
        ProviderInfo(
            id="openai",
            name="OpenAI",
            available=bool(settings.openai_api_key and openai_models),
            default_model=settings.openai_model,
            models=openai_models,
        ),
        ProviderInfo(
            id="mistral",
            name="Mistral AI",
            available=bool(settings.mistral_api_key and mistral_models),
            default_model=settings.mistral_model,
            models=mistral_models,
        ),
        ProviderInfo(
            id="anthropic",
            name="Anthropic",
            available=bool(settings.anthropic_api_key and anthropic_models),
            default_model=settings.anthropic_model,
            models=anthropic_models,
        ),
    ]

    return ProvidersResponse(
        providers=providers,
        default_provider=settings.llm_provider,
    )
