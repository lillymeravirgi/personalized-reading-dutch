# LearnDutch

LearnDutch is an HCI course group project for studying personalized Dutch reading support for second-language learners. The frontend app is in `frontend/leeswijs`.

The main goal is to run a clean experiment and collect usable data about reading engagement, willingness to continue reading, cognitive load, and vocabulary learning.


## Research Questions

**RQ1.** Does personalized reading content increase learners' willingness to continue reading compared with a non-personalized baseline

**RQ2.** Does interest-based and vocabulary-aware personalization increase engagement while maintaining an appropriate cognitive load compared with a non-personalized baseline

**RQ3.** Does personalized reading content improve vocabulary acquisition and 24-hour retention compared with a non-personalized baseline

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Zustand, React Router
- **Backend:** FastAPI, SQLAlchemy
- **Local database:** SQLite
- **Online database:** Neon Postgres, configured only in Render
- **LLM:** Google Gemini
- **API prefix:** `/api`

## Repository Structure

```text
backend/
  main.py
  download_study_export.py
  seed.py
  requirements.txt
  .env.example
  app/
    models.py
    schemas.py
    session_generator.py
    krs_service.py
    routers/

frontend/leeswijs/
  package.json
  .env.example
  src/
    pages/
    components/
    services/api.ts
    store/index.ts
    types/index.ts
```

## Local Setup

You need:

- Python 3.11 or newer
- Node 20 or newer
- A Google AI Studio / Gemini API key for reading generation

### 1. Pull the Latest Code

```bash
git pull
```

### 2. Set Up the Backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows PowerShell, activate the virtual environment with:

```powershell
.venv\Scripts\Activate.ps1
```



```env
DATABASE_URL=sqlite:///./dev.db
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
GOOGLE_API_KEY=your-own-gemini-key
GEMINI_MODEL=gemini-2.5-flash-lite

SEED_TEST_ACCOUNTS=true
SEED_TEST_PASSWORD=choose-a-local-password
RESET_TEAM_ACCOUNT_DATA=false
EXPORT_API_BASE_URL=
EXPORT_TOKEN=
```

Create the local database, load the lexicon, and create local test accounts:

```bash
python seed.py
```

Start the backend:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Useful backend URLs:

- Health check: `http://127.0.0.1:8000/`
- API docs: `http://127.0.0.1:8000/docs`

### 3. Set Up the Frontend

Open a second terminal from the repository root:

```bash
cd frontend/leeswijs
npm install
cp .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5173
```

The app runs at:

```text
http://127.0.0.1:5173
```

`frontend/leeswijs/.env.local` should stay local and should normally contain:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## Local Test Accounts

If `SEED_TEST_ACCOUNTS=true`, `python seed.py` creates these local Study IDs:

```text
KIM
KIKI
JULIAN
TJ
EVIE
JY
```

Use the password you set in `SEED_TEST_PASSWORD`.

To reset local test data:

1. Stop the backend server.
2. Delete `backend/dev.db`.
3. Run `python seed.py` again from `backend`.
4. Restart the backend server.

## Online Deployment Policy

Online deployment uses Vercel for the frontend, Render for the FastAPI backend, and Neon Postgres for the study database. Deployment settings and online data access are managed by the deployment owner, not committed to GitHub.

## Study Data for Analysis

run `python backend/download_study_export.py` to download the study data zip into `backend/exports/`. The script requires an online `https://.../api` backend URL and will not use a local localhost backend for analysis exports.

The zip contains CSV files for users, topics, assessment batches, onboarding words, recommended vocabulary, user vocabulary vectors, reading sessions, interaction telemetry, survey results, vocabulary test results, and lexicon data. Authentication fields such as password hashes and emails are excluded.

## Common Problems

### Backend cannot find packages

Activate the virtual environment again:

```bash
cd backend
source .venv/bin/activate
```

Then rerun:

```bash
pip install -r requirements.txt
```

### Frontend cannot reach the backend

Check that the backend is running at `http://127.0.0.1:8000/`.

Then check `frontend/leeswijs/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

After changing `.env.local`, restart the frontend dev server.

### Login test accounts do not work

Check `backend/.env`:

```env
SEED_TEST_ACCOUNTS=true
SEED_TEST_PASSWORD=your-local-password
```

Then rerun:

```bash
cd backend
python seed.py
```
