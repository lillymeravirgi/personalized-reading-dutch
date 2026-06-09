import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite:///./dev.db"
)

FRONTEND_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")

DEFAULT_K: float = 0.7

try:
    DELAYED_VOCAB_TEST_MINUTES: int = int(os.getenv("DELAYED_VOCAB_TEST_MINUTES", "1440"))
except ValueError:
    DELAYED_VOCAB_TEST_MINUTES = 1440
