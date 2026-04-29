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
    yield


app = FastAPI(
    title="Personalized Reading Dutch API",
    description="Backend API for the Dutch reading research prototype.",
    version="0.2.0",
    lifespan=lifespan,
)

# Allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
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
