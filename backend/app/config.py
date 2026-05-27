import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ root (one level up from app/)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite:///./dev.db"  # fallback for local dev without MySQL
)

FRONTEND_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

# No hardcoded fallback — the key must come from .env. Never commit API keys.
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

# Default model for local development.
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

# K-probability default: 70% chance of picking an INTERESTED topic
DEFAULT_K: float = 0.7

REQUIRE_STUDY_CODE: bool = os.getenv("REQUIRE_STUDY_CODE", "false").lower() in {
    "1",
    "true",
    "yes",
}
STUDY_INVITE_CODES: set[str] = {
    code.strip().upper()
    for code in os.getenv("STUDY_INVITE_CODES", "").split(",")
    if code.strip()
}
