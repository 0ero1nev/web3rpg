from functools import lru_cache

from pydantic import AnyHttpUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. SecretStr prevents accidental repr/log leakage."""

    analyzer_base_url: AnyHttpUrl = Field(default="http://127.0.0.1:3000")
    analyzer_service_token: SecretStr
    analyzer_timeout: float = Field(default=120.0, gt=0, le=600)
    analyzer_sites_auth_token: SecretStr | None = None

    openai_api_key: SecretStr
    openai_model: str = Field(default="gpt-5-mini", min_length=1)
    openai_timeout: float = Field(default=60.0, gt=0, le=300)
    model_retries: int = Field(default=2, ge=0, le=5)

    agent_request_timeout: float = Field(default=150.0, gt=0, le=900)
    agent_max_tool_calls: int = Field(default=1, ge=0, le=4)
    agent_max_graph_steps: int = Field(default=8, ge=4, le=32)

    log_level: str = Field(default="INFO")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
