from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import (
    assessment,
    auth,
    experiment,
    flashcards,
    interests,
    krs,
    lexicon,
    session,
    surveys,
    telemetry,
    users,
    vocab_test,
    vocabulary,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create / migrate tables on startup (idempotent)
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    yield


def _ensure_sqlite_columns() -> None:
    """Small dev migration for older SQLite databases created before auth fields."""
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        user_columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        }
        if "email" not in user_columns:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN email VARCHAR(255)")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")
        if "password_hash" not in user_columns:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)")
        if "display_name" not in user_columns:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN display_name VARCHAR(255)")

        session_columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(reading_sessions)").fetchall()
        }
        if "survey_signal" not in session_columns:
            conn.exec_driver_sql("ALTER TABLE reading_sessions ADD COLUMN survey_signal JSON")


app = FastAPI(
    title="Personalized Reading Dutch API",
    description="Backend API for the Dutch reading research prototype.",
    version="0.2.0",
    lifespan=lifespan,
)

# Allow the React dev server. Vite defaults to 5173 but the README runs it on
# 3000 — keep both so either invocation works without surprise CORS errors.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes are grouped by feature and mounted under /api.
app.include_router(assessment.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(experiment.router, prefix="/api")
app.include_router(flashcards.router, prefix="/api")
app.include_router(interests.router, prefix="/api")
app.include_router(krs.router, prefix="/api")
app.include_router(lexicon.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(surveys.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(vocab_test.router, prefix="/api")
app.include_router(vocabulary.router, prefix="/api")


@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "message": "Personalized-Reading-Dutch API v0.2.0 is running"}
