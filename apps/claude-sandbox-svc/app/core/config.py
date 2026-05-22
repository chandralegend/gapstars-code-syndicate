"""Service configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Required secrets
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    token_secret: str = Field(default="dev-secret-change-me", alias="TOKEN_SECRET")

    # Sandbox image + docker
    sandbox_image: str = Field(default="qa-sandbox:local", alias="SANDBOX_IMAGE")
    sandbox_mem_limit: str = Field(default="2g", alias="SANDBOX_MEM_LIMIT")
    sandbox_cpus: float = Field(default=1.0, alias="SANDBOX_CPUS")
    sandbox_network: str | None = Field(default=None, alias="SANDBOX_NETWORK")

    # Display
    width: int = Field(default=1280, alias="WIDTH")
    height: int = Field(default=800, alias="HEIGHT")

    # Concurrency / lifecycle
    max_concurrent_tasks: int = Field(default=2, alias="MAX_CONCURRENT_TASKS")
    default_timeout_seconds: int = Field(default=1800, alias="DEFAULT_TIMEOUT_SECONDS")
    retention_days: int = Field(default=7, alias="RETENTION_DAYS")

    # Storage
    data_dir: Path = Field(default=Path("./data"), alias="DATA_DIR")

    # Networking / VNC
    public_base_url: str = Field(default="http://127.0.0.1:8000", alias="PUBLIC_BASE_URL")
    vnc_proxy_mode: str = Field(default="proxy", alias="VNC_PROXY_MODE")  # "proxy" or "direct"
    vnc_bind_host: str = Field(default="127.0.0.1", alias="VNC_BIND_HOST")
    token_ttl_seconds: int = Field(default=7200, alias="TOKEN_TTL_SECONDS")

    # Default model passed through to the sandbox if the request omits one.
    default_model: str = Field(
        default="claude-sonnet-4-5-20250929", alias="DEFAULT_MODEL"
    )

    @property
    def db_path(self) -> Path:
        return self.data_dir / "tasks.db"

    @property
    def tasks_dir(self) -> Path:
        return self.data_dir / "tasks"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.tasks_dir.mkdir(parents=True, exist_ok=True)
    return settings
