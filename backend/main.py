from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import FRONTEND_ORIGINS
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
    _ensure_database_columns()
    yield


def _quote_sqlite_name(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _ensure_database_columns() -> None:
    defaults = {
        ("users", "onboarding_completed"): "0",
        ("users", "current_condition"): "'ADAPTIVE'",
        ("users", "has_switched_conditions"): "0",
        ("user_vocabulary_vector", "mastery_score"): "0.0",
        ("user_vocabulary_vector", "exposure_count"): "1",
        ("user_vocabulary_vector", "review_priority"): "0",
        ("recommended_vocabulary", "is_used"): "0",
        ("reading_sessions", "reading_number"): "1",
        ("reading_sessions", "survey_completed"): "0",
        ("reading_sessions", "study_phase"): "1",
        ("vocabulary_test_results", "study_phase"): "1",
        ("vocabulary_test_results", "test_type"): "'immediate'",
    }

    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS study_code VARCHAR(50)"
            )
            conn.exec_driver_sql(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false"
            )
            conn.exec_driver_sql(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS current_condition VARCHAR(8) NOT NULL DEFAULT 'ADAPTIVE'"
            )
            conn.exec_driver_sql(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS has_switched_conditions BOOLEAN NOT NULL DEFAULT false"
            )
            conn.exec_driver_sql(
                "ALTER TABLE user_vocabulary_vector "
                "ADD COLUMN IF NOT EXISTS mastery_score DOUBLE PRECISION NOT NULL DEFAULT 0.0"
            )
            conn.exec_driver_sql(
                "ALTER TABLE user_vocabulary_vector "
                "ADD COLUMN IF NOT EXISTS exposure_count INTEGER NOT NULL DEFAULT 1"
            )
            conn.exec_driver_sql(
                "ALTER TABLE user_vocabulary_vector "
                "ADD COLUMN IF NOT EXISTS review_priority INTEGER NOT NULL DEFAULT 0"
            )
            conn.exec_driver_sql(
                "ALTER TABLE user_vocabulary_vector "
                "ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMP"
            )
            conn.exec_driver_sql(
                "ALTER TABLE user_vocabulary_vector "
                "ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP"
            )
            conn.exec_driver_sql(
                "ALTER TABLE user_vocabulary_vector "
                "ADD COLUMN IF NOT EXISTS review_interval_days INTEGER"
            )
            conn.exec_driver_sql(
                "ALTER TABLE recommended_vocabulary "
                "ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT false"
            )
            conn.exec_driver_sql(
                "ALTER TABLE onboarding_words "
                "ADD COLUMN IF NOT EXISTS study_phase INTEGER NOT NULL DEFAULT 1"
            )
            conn.exec_driver_sql(
                "ALTER TABLE reading_sessions "
                "ADD COLUMN IF NOT EXISTS reading_number INTEGER NOT NULL DEFAULT 1"
            )
            conn.exec_driver_sql(
                "ALTER TABLE reading_sessions "
                "ADD COLUMN IF NOT EXISTS survey_completed BOOLEAN NOT NULL DEFAULT false"
            )
            conn.exec_driver_sql(
                "ALTER TABLE reading_sessions "
                "ADD COLUMN IF NOT EXISTS study_phase INTEGER NOT NULL DEFAULT 1"
            )
            conn.exec_driver_sql(
                "ALTER TABLE vocabulary_test_results "
                "ADD COLUMN IF NOT EXISTS study_phase INTEGER NOT NULL DEFAULT 1"
            )
            conn.exec_driver_sql(
                "ALTER TABLE vocabulary_test_results "
                "ADD COLUMN IF NOT EXISTS test_type VARCHAR(20) NOT NULL DEFAULT 'immediate'"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_vocab_test_user_phase_type "
                "ON vocabulary_test_results (user_id, session_group_id, study_phase, test_type)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_reading_sessions_user_phase_number "
                "ON reading_sessions (user_id, study_phase, reading_number)"
            )
        return

    if engine.dialect.name != "sqlite":
        return

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
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_users_study_code ON users (study_code)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_vocab_test_user_phase_type "
            "ON vocabulary_test_results (user_id, session_group_id, study_phase, test_type)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_reading_sessions_user_phase_number "
            "ON reading_sessions (user_id, study_phase, reading_number)"
        )


app = FastAPI(
    title="Personalized Reading Dutch API",
    description="Backend API for the Dutch reading research prototype.",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
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
