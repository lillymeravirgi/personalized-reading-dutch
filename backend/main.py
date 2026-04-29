from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import krs, session, telemetry, vocabulary, lexicon, users, auth, interests


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create / migrate tables on startup (idempotent)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Personalized Reading Dutch — API",
    description="KRS + Gemini Storyteller backend for the L2 Dutch reading prototype.",
    version="0.2.0",
    lifespan=lifespan,
)

# Allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(session.router)
app.include_router(telemetry.router)
app.include_router(vocabulary.router)
app.include_router(krs.router)
app.include_router(lexicon.router)
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(interests.router)


@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "message": "Personalized-Reading-Dutch API v0.2.0 is running"}