# LearnDutch

LearnDutch is an HCI course group project for studying personalized Dutch reading support for second-language learners. The frontend app is in `frontend/leeswijs`.

The main goal is to run a clean experiment and collect usable data about reading engagement, willingness to continue reading, cognitive load, and vocabulary learning.

## Research Questions

**RQ1.** Does personalized reading content increase learners' willingness to continue reading compared with a non-personalized baseline

**RQ2.** Does interest-based and vocabulary-aware personalization increase engagement while maintaining an appropriate cognitive load compared with a non-personalized baseline

**RQ3.** Does personalized reading content improve vocabulary acquisition and 24-hour retention compared with a non-personalized baseline

## Stack

- **Frontend:** React 19, Vite, TypeScript, Zustand, React Router
- **Backend:** FastAPI, SQLAlchemy, SQLite (local)
- **LLM:** Google Gemini 2.5 Flash Lite
- **API prefix:** `/api`

## Environment Policy

This repository is kept as the local development version. Team members should run the app with a local SQLite database and a local FastAPI backend.

Online deployment is handled separately by the deployment owner:

- **Local team testing:** SQLite, localhost backend, localhost frontend
- **Online study:** Vercel frontend, Render backend, Neon database

Do not put Render, Neon, Vercel, API keys, database passwords, or participant passwords into committed files. Keep those values in local `.env` files or in the deployment platform settings.

## Local Setup

You need Python 3.11+, Node 20+, and a Gemini API key.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy the env file and add your key:

```bash
cp .env.example .env
```

```env
GOOGLE_API_KEY=your-key-here
DATABASE_URL=sqlite:///./dev.db
GEMINI_MODEL=gemini-2.5-flash-lite
ALLOW_SELF_REGISTRATION=false
SEED_TEST_ACCOUNTS=true
SEED_TEST_PASSWORD=your-local-test-password
```

Seed the database (creates tables + test accounts):

```bash
python seed.py
```

Default test Study IDs:

```
KIM  KIKI  JULIAN  TJ  EVIE  JY
```

Use the local password you set in `SEED_TEST_PASSWORD`.

To reset: stop the server, delete `backend/dev.db`, run `python seed.py` again.

Start the server:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

API docs at `http://127.0.0.1:8000/docs`.

### Frontend

```bash
cd frontend/leeswijs
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

App runs at `http://127.0.0.1:5173`.

Optional: create `frontend/leeswijs/.env.local` to override the API URL:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## Project Structure

```
backend/
  main.py
  seed.py
  requirements.txt
  .env.example
  app/
    models.py
    schemas.py
    session_generator.py
    krs_service.py
    routers/
      auth.py  session.py  surveys.py  vocab_test.py
      flashcards.py  telemetry.py  users.py  ...

frontend/leeswijs/
  src/
    pages/
    components/
    services/api.ts
    store/index.ts
    types/index.ts
```
