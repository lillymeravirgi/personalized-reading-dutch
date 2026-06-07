# Learn Dutch

https://leeswijs.vercel.app/login

Learn Dutch is an HCI course group project for studying personalized Dutch reading support for second-language learners. The frontend app is in `frontend/leeswijs`.

The main goal is to run a clean experiment and collect usable data about reading engagement, willingness to continue reading, cognitive load, and vocabulary learning.

## Research Questions

**RQ1.** Does personalized reading content increase learners' willingness to continue reading compared with a non-personalized baseline

**RQ2.** Does interest-based and vocabulary-aware personalization increase engagement while maintaining an appropriate cognitive load compared with a non-personalized baseline

**RQ3.** Does personalized reading content improve vocabulary acquisition and 24-hour retention compared with a non-personalized baseline

## Experiment Protocol

The study uses a within-subject, counterbalanced design. Each participant completes both conditions:

- **Adaptive:** CEFR-matched, interest-based, vocabulary-aware, with cross-session adaptation.
- **Baseline:** CEFR-matched, general/random topic selection, static CEFR vocabulary, no cross-session adaptation.

The protocol is grounded in Flow Theory and the Zone of Proximal Development. The system does not aim to make texts simply easier; it aims to keep texts appropriately challenging and engaging.


## Stack

- **Frontend:** React 19, Vite, TypeScript, Zustand, React Router
- **Backend:** FastAPI, SQLAlchemy, SQLite
- **LLM:** Google Gemini 2.5 Flash
- **API prefix:** `/api`
- **Prototype auth:** login endpoint plus `X-User-Id` header for user-scoped API calls

## Quick Start

You need:

- Python 3.11 or newer. Python 3.9 will not work with the current backend code.
- Node.js 20 or newer.
- A Gemini API key for generated readings.

### Backend

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add GOOGLE_API_KEY in backend/.env

python seed.py
uvicorn main:app --port 8000 --reload
```

Windows PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env
# Add GOOGLE_API_KEY in backend\.env

python seed.py
uvicorn main:app --port 8000 --reload
```

API docs:

```text
http://localhost:8000/docs
```

### Frontend

Open a second terminal:

macOS / Linux:

```bash
cd frontend/leeswijs
npm install
VITE_API_BASE_URL=http://localhost:8000/api npm run dev -- --host 127.0.0.1 --port 5174
```

Windows PowerShell:

```powershell
cd frontend/leeswijs
npm install
$env:VITE_API_BASE_URL="http://localhost:8000/api"
npm run dev -- --host 127.0.0.1 --port 5174
```

App:

```text
http://127.0.0.1:5174/login
```

You can also use Vite's default port if it is free:

```bash
npm run dev
```

## Environment Variables

Create `backend/.env` from `backend/.env.example`.

```env
DATABASE_URL=sqlite:///./dev.db
GOOGLE_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash
```

Optional frontend variables:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## Local Run Checklist

If the app does not load after pulling:

- Check your Python version with `python --version` or `py --version`. Use Python 3.11+.
- If dependency installation fails, delete the old virtual environment and recreate it.
- Make sure the backend is running on `http://localhost:8000`.
- Make sure `backend/.env` exists and contains `GOOGLE_API_KEY`.
- Run `python seed.py` if `backend/dev.db` does not exist.
- Set `VITE_API_BASE_URL=http://localhost:8000/api` when starting the frontend.
- If port 8000 or 5174 is already in use, stop the old server or choose another port.

## Project Structure

```text
personalized-reading-dutch/
|-- backend/
|   |-- main.py
|   |-- seed.py
|   |-- requirements.txt
|   |-- .env.example
|   `-- app/
|       |-- config.py
|       |-- database.py
|       |-- deps.py
|       |-- models.py
|       |-- schemas.py
|       |-- session_generator.py
|       |-- krs_service.py
|       |-- topic_service.py
|       |-- validator.py
|       `-- routers/
|           |-- assessment.py
|           |-- auth.py
|           |-- experiment.py
|           |-- flashcards.py
|           |-- krs.py
|           |-- lexicon.py
|           |-- session.py
|           |-- surveys.py
|           |-- telemetry.py
|           |-- users.py
|           |-- vocab_test.py
|           `-- vocabulary.py
`-- frontend/
    `-- leeswijs/
        |-- package.json
        `-- src/
            |-- App.tsx
            |-- main.tsx
            |-- components/
            |-- hooks/
            |-- layouts/
            |-- mocks/
            |-- pages/
            |-- services/api.ts
            |-- store/index.ts
            `-- types/
```
