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

    # When the service runs inside a container and spawns *sibling* containers
    # via the host Docker daemon, ``data_dir`` (e.g. ``/data``) is the path
    # *inside this container*. The host's Docker daemon, however, only knows
    # the bind-mount source on the host filesystem (e.g.
    # ``/Users/me/proj/apps/claude-sandbox-svc/data``).
    #
    # Setting ``HOST_DATA_DIR`` to that host-side path lets us translate
    # per-task paths before passing them to docker-py's ``volumes=...``.
    # Leave unset when running on the host directly (no translation needed).
    host_data_dir: str | None = Field(default=None, alias="HOST_DATA_DIR")

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

    def host_path_for(self, in_container_path: Path) -> str:
        """Translate an in-container path under ``data_dir`` to its host equivalent.

        Used when handing bind-mount paths to the host Docker daemon. If
        ``host_data_dir`` is unset (running directly on the host), the input
        path is returned unchanged.
        """
        if not self.host_data_dir:
            return str(in_container_path)
        try:
            relative = Path(in_container_path).resolve().relative_to(
                self.data_dir.resolve()
            )
        except ValueError:
            # Path is not under data_dir; return as-is and hope for the best.
            return str(in_container_path)
        return str(Path(self.host_data_dir) / relative)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.tasks_dir.mkdir(parents=True, exist_ok=True)
    return settings
