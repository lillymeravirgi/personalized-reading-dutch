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

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY") or ""
# OR use an assertion to satisfy Pyre
key = os.getenv("GOOGLE_API_KEY")
assert key is not None, "GOOGLE_API_KEY must be set in .env"
GOOGLE_API_KEY: str = key

# gemini-2.5-flash is the current stable generation (2025)
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# K-probability default: 70% chance of picking an INTERESTED topic
DEFAULT_K: float = 0.7
