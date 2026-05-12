from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import (
    assessment,
    auth,
    experiment,
    flashcards,
    krs,
    lexicon,
    onboarding,
    session,
    surveys,
    telemetry,
    users,
    vocab_test,
    vocabulary,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    yield


def _quote_sqlite_name(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _ensure_sqlite_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    defaults = {
        ("users", "onboarding_completed"): "0",
        ("user_vocabulary_vector", "mastery_score"): "0.0",
        ("user_vocabulary_vector", "exposure_count"): "1",
        ("user_vocabulary_vector", "review_priority"): "0",
        ("recommended_vocabulary", "is_used"): "0",
        ("reading_sessions", "reading_number"): "1",
        ("reading_sessions", "survey_completed"): "0",
    }

    with engine.begin() as conn:
        tables = {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }

        for table in Base.metadata.sorted_tables:
            if table.name not in tables:
                continue
            existing = {
                row[1]
                for row in conn.exec_driver_sql(
                    f"PRAGMA table_info({_quote_sqlite_name(table.name)})"
                ).fetchall()
            }
            for column in table.columns:
                if column.primary_key or column.name in existing:
                    continue
                ddl = (
                    f"ALTER TABLE {_quote_sqlite_name(table.name)} "
                    f"ADD COLUMN {_quote_sqlite_name(column.name)} "
                    f"{column.type.compile(dialect=engine.dialect)}"
                )
                default = defaults.get((table.name, column.name))
                if default is not None:
                    ddl += f" DEFAULT {default} NOT NULL"
                conn.exec_driver_sql(ddl)

        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_users_username ON users (username)"
        )


app = FastAPI(
    title="Personalized Reading Dutch API",
    description="Backend API for the Dutch reading research prototype.",
    version="0.3.0",
    lifespan=lifespan,
)

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

app.include_router(assessment.router,  prefix="/api")
app.include_router(auth.router,        prefix="/api")
app.include_router(experiment.router,  prefix="/api")
app.include_router(flashcards.router,  prefix="/api")
app.include_router(krs.router,         prefix="/api")
app.include_router(lexicon.router,     prefix="/api")
app.include_router(onboarding.router,  prefix="/api")
app.include_router(session.router,     prefix="/api")
app.include_router(surveys.router,     prefix="/api")
app.include_router(telemetry.router,   prefix="/api")
app.include_router(users.router,       prefix="/api")
app.include_router(vocab_test.router,  prefix="/api")
app.include_router(vocabulary.router,  prefix="/api")


@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "message": "Personalized-Reading-Dutch API v0.3.0 is running"}
