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

# No hardcoded fallback — the key must come from .env. Never commit API keys.
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

# Default model for local development.
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# K-probability default: 70% chance of picking an INTERESTED topic
DEFAULT_K: float = 0.7
