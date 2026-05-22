from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProviderName = Literal["openai", "mistral", "anthropic"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Default provider ──────────────────────────────────────────────────────
    llm_provider: LLMProviderName = "openai"

    # ── OpenAI ────────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # ── Mistral ───────────────────────────────────────────────────────────────
    mistral_api_key: str = ""
    mistral_model: str = "mistral-small-latest"

    # ── Anthropic ─────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # ── Postgres ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql://postgres:postgres@localhost:5432/multiagent"

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── API server ────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # ── claude-sandbox-svc (Agent 2 substrate) ────────────────────────────────
    sandbox_base_url: str = "http://claude-sandbox-svc:8000"
    sandbox_enabled: bool = True
    sandbox_default_timeout_seconds: int = 360
    sandbox_poll_interval_seconds: float = 3.0
    sandbox_default_model: str = "claude-sonnet-4-5-20250929"
    sandbox_max_iterations: int = 12

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    def default_model_for(self, provider: LLMProviderName) -> str:
        """Return the configured default model for the given provider."""
        return {
            "openai": self.openai_model,
            "mistral": self.mistral_model,
            "anthropic": self.anthropic_model,
        }[provider]

    def api_key_for(self, provider: LLMProviderName) -> str:
        """Return the API key for the given provider."""
        return {
            "openai": self.openai_api_key,
            "mistral": self.mistral_api_key,
            "anthropic": self.anthropic_api_key,
        }[provider]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
