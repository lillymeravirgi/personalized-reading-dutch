# LearnDutch

LearnDutch is an HCI course group project for studying personalized Dutch reading support for second-language learners. The frontend app is in `frontend/leeswijs`.The main goal is to run a clean experiment and collect usable data about reading engagement,
perceived difficulty, cognitive load, and vocabulary learning.

## Research Goal

We compare two versions of the same reading experience:

- **Baseline:** AI-generated Dutch text at the learner's level, without using the learner's interests or vocabulary profile for personalization.
- **Adaptive:** AI-generated Dutch text at the learner's level, using the learner's interests and vocabulary profile.

Both conditions should use the same UI . Participants should not see whether they are in the baseline or adaptive condition.

## Research Questions

**RQ1.** Does personalized reading content adapted to a learner's vocabulary level and interests reduce perceived reading difficulty compared with a non-personalized baseline?

**RQ2.** Does interest-based and vocabulary-aware personalization increase user engagement during reading compared with a non-personalized baseline?

**RQ3.** 


## Testing Accounts

The intended account convention for the study is:

- `user01` to `user10`: participant accounts, randomly assigned to study participants
- `user11` to `user16`: internal team testing accounts

The default password is the same as the username. For example:

```text
username: user01
password: user01
```

The backend seed data creates these accounts from `user01` to `user16`.

## Stack

- **Frontend:** React 19, Vite, TypeScript, Zustand, React Router
- **Backend:** FastAPI, SQLAlchemy, SQLite
- **LLM:** Google Gemini 2.5 Flash
- **API prefix:** `/api`
- **Prototype auth:** login endpoint plus `X-User-Id` header for user-scoped API calls

## How to Run

You need Python 3.11, Node.js 20+, and a Gemini API key.

### Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add your GOOGLE_API_KEY in backend/.env

python seed.py
uvicorn main:app --port 8000 --reload
```

API docs:

```text
http://localhost:8000/docs
```

### Frontend

```bash
cd frontend/leeswijs
npm install
npm run dev -- --port 3000
```

App:

```text
http://localhost:3000/login
```

For a frontend-only demo:

```bash
VITE_USE_MOCK=true npm run dev -- --port 3000
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
VITE_USE_MOCK=true
```

## Project Structure

```text
Dutch learning/
├── README.md
├── backend/
│   ├── main.py
│   ├── seed.py
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── config.py
│       ├── database.py
│       ├── deps.py
│       ├── models.py
│       ├── schemas.py
│       ├── session_generator.py
│       ├── krs_service.py
│       ├── topic_service.py
│       ├── validator.py
│       └── routers/
│           ├── assessment.py
│           ├── auth.py
│           ├── experiment.py
│           ├── flashcards.py
│           ├── krs.py
│           ├── lexicon.py
│           ├── session.py
│           ├── surveys.py
│           ├── telemetry.py
│           ├── users.py
│           ├── vocab_test.py
│           └── vocabulary.py
└── frontend/
    └── leeswijs/
        ├── package.json
        └── src/
            ├── App.tsx
            ├── main.tsx
            ├── components/
            ├── hooks/
            ├── layouts/
            ├── mocks/
            ├── pages/
            ├── services/api.ts
            ├── store/index.ts
            └── types/
```
