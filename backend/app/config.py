"""Application settings, read from NABTA_* environment variables or backend/.env."""

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_STORAGE_DIR = BACKEND_DIR / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NABTA_",
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = f"sqlite:///{(DEFAULT_STORAGE_DIR / 'nabta.db').as_posix()}"
    storage_dir: Path = DEFAULT_STORAGE_DIR
    frontend_url: str = "http://localhost:5173"
    session_days: int = 7
    cookie_secure: bool = False
    reset_token_minutes: int = 60
    max_upload_mb: int = 10
    # The exported pest model (model.onnx + model_card.json), produced by ml/. Not in git.
    model_dir: Path = BACKEND_DIR / "models" / "nabta-pest"

    # AI features (plant reports, specialist drafts, questions about a pest). Off without a key.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-6-luna"
    openai_timeout_seconds: float = 45.0

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True

    @property
    def photos_dir(self) -> Path:
        return self.storage_dir / "photos"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024
