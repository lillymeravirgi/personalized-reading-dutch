# LearnDutch

LearnDutch is an HCI course group project for studying personalized Dutch reading support for second-language learners. The frontend app is in `frontend/leeswijs`.

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

## How to Run

You need Python 3.11+, Node.js 20+, and a Gemini API key.

### Backend

1. Navigate to the backend directory and set up a virtual environment:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   # Open .env and add your GOOGLE_API_KEY and configure other settings
   ```

3. Seed the database and start the FastAPI dev server:
   ```bash
   python seed.py
   uvicorn main:app --port 8000 --reload
   ```

The backend API documentation is available at:
`http://localhost:8000/docs`

### Frontend

1. Navigate to the frontend directory and install dependencies:
   ```bash
   cd frontend/leeswijs
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev -- --port 3000
   ```

The application will be accessible at `http://localhost:3000`.

---

## Crossover Study: Choosing Starting Condition

To support our controlled **Within-Subjects Crossover Study**, researchers can assign participants to start in either the **ADAPTIVE** or **BASELINE** condition using URL query parameters during registration.

### 1. Register a Participant
Direct the participant to the registration page with the `start` parameter:

* **To start with the Adaptive (Personalized) Condition:**
  `http://localhost:3000/register?start=ADAPTIVE`

* **To start with the Baseline (Generic CEFR) Condition:**
  `http://localhost:3000/register?start=BASELINE`

### 2. Experiment Flow
The system automatically manages the crossover transition:
1. **Phase 1 Onboarding:** Participant learns 7 initial words.
2. **Phase 1 Reading:** Participant reads 3 gated articles under their assigned starting condition and completes their post-reading surveys.
3. **Phase 1 Vocab Test:** Once the 3rd reading is complete, the participant takes a vocabulary test. Upon submission:
   * The backend automatically flips their condition to the counterbalanced alternative (e.g., ADAPTIVE ➔ BASELINE or vice-versa).
   * The frontend shows a transition screen instructing them to notify the researcher/take a short break.
4. **Phase 2 Onboarding:** Participant studies 7 new words.
5. **Phase 2 Reading:** Participant reads 3 gated articles under the counterbalanced condition.
6. **Phase 2 Vocab Test:** Participant completes the final vocabulary test, concluding the study.


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
