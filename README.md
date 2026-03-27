# 🇳🇱 Dutch Adaptive Storyteller — Backend Engine

> **Vertical Prototype** · Research Project · Maastricht University  
> A Knowledge-Based Recommender System (KRS) that generates **personalized Dutch reading texts** tailored to each learner's CEFR level, vocabulary state, and interests — powered by Gemini.

---

## How It Works

```
User Profile (DB)          Vocabulary Vector (DB)
      │                            │
      └────────────┬───────────────┘
                   ▼
          KRS Prompt Builder
       (Blue Words + Yellow Words)
                   │
                   ▼
          Gemini 2.5 Flash API
                   │
                   ▼
    Adaptive Dutch Story  →  [[new]] · ((learning))
                   │
                   ▼
       reading_sessions table (MySQL)
```

- **Blue Words `[[word]]`** — CEFR-matched lexicon words the user has *never seen*  
- **Yellow Words `((word))`** — words already in the user's active `LEARNING` list  
- The system ensures every target word appears naturally in the generated text.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| MySQL Server | 8.0+ (local or remote) |
| Google AI Studio API Key | [aistudio.google.com](https://aistudio.google.com) |

---

## Environment Setup

### 1. Create `.env` in `backend/`

```env
# Database
DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost/reading_db

# Gemini
GOOGLE_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-2.5-flash
```

> **Never commit `.env` to git.** It is listed in `.gitignore`.

### 2. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

> If SQLAlchemy or PyMySQL are missing: `pip install sqlalchemy pymysql`

---

## Database Initialization

```bash
cd backend
python3.11 seed.py
```

This will:
1. Create all tables (`users`, `lexicon`, `user_topics`, `user_vocabulary_vectors`, `reading_sessions`, …)
2. Populate **30 Dutch lexicon words** (A1 → B1)
3. Create **3 classroom users**:

| User ID | Name | Level | Goal | Location |
|---------|------|-------|------|----------|
| `u_A1` | Sophie | A1 | Social | Amsterdam |
| `u_A2` | Lars | A2 | Work | Rotterdam |
| `u_014` | Rowaid | B1 | Academic | Maastricht |

---

## How to Run

### 🔧 Option A — Interactive Terminal Engine (Demo / Research)

```bash
cd backend
python3.11 run_engine.py
```

```
🇳🇱  Dutch Storyteller Engine — Multi-User Interactive Mode

  ⟳ Sanity-checking gemini-2.5-flash… ✓ Got: 'Hallo'

Name [Sophie/Lars/Rowaid] > Lars
Topic > Treinen in Rotterdam
```

The engine will:
- Print the full **system instruction + user prompt** sent to Gemini
- Show the **Blue / Yellow word selection** for the session
- Display the generated story with **colour-coded** `[[blue]]` / `((yellow))` words
- Automatically **save** the session to `reading_sessions`

### 🌐 Option B — REST API (for frontend / integration)

```bash
cd backend
python3.11 -m uvicorn main:app --reload --port 8000
```

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/session/generate` | Generate & save a new story |
| `GET`  | `/session/list` | List all sessions (optionally `?user_id=u_014`) |
| `GET`  | `/session/{id}` | Get full session detail |
| `GET`  | `/lexicon/define/{word}` | Dynamic Gemini-powered word definition |
| `POST` | `/telemetry/log` | Log user interaction intent |
| `POST` | `/krs/run/{user_id}` | Manually trigger KRS |
| `POST` | `/krs/check/{user_id}` | Auto-trigger KRS if Blue pool < 20 |

Interactive docs: **http://localhost:8000/docs**

---

## Project Structure

```
backend/
├── app/
│   ├── config.py            # GOOGLE_API_KEY, GEMINI_MODEL, DATABASE_URL
│   ├── database.py          # SQLAlchemy engine + SessionLocal
│   ├── models.py            # All ORM models + Enums
│   ├── schemas.py           # Pydantic request/response models
│   ├── krs_service.py       # Knowledge-Based Recommender System logic
│   ├── session_generator.py # Gemini storyteller (prompt build + API call)
│   └── routers/
│       ├── session.py       # /session/* endpoints
│       ├── lexicon.py       # /lexicon/* endpoints
│       ├── vocabulary.py    # /vocab/* endpoints
│       ├── telemetry.py     # /telemetry/* endpoints
│       └── krs.py           # /krs/* endpoints
├── main.py                  # FastAPI app + CORS + router registration
├── seed.py                  # One-time DB seeder (users + lexicon)
├── run_engine.py            # Interactive terminal storyteller
├── test_integration.py      # 3-test integration script (DB + Gemini + API)
└── requirements.txt
```

---

## Running the Integration Test

```bash
# With the API server running on port 8000:
cd backend
python3.11 test_integration.py
```

Tests:
1. **Database connectivity** — counts users, lexicon words, sessions
2. **Gemini API key** — sends a minimal prompt and checks for a response
3. **POST /session/generate** — end-to-end story generation

---

## Research Notes

This system is designed around a **2-condition study design**:

| Condition | `ConditionType` | Description |
|-----------|----------------|-------------|
| Adaptive | `ADAPTIVE` | KRS selects Blue/Yellow words; Gemini injects them |
| Baseline | `BASELINE` | Generic story generation with no vocabulary targeting |

Telemetry events logged per word interaction:

| Event | `IntentTagType` | Trigger |
|-------|----------------|---------|
| `DEEP_PROCESSING` | User clicked "See Examples" |
| `ACQUISITION_INTENT` | User clicked "Add to Learn List" |
| `WORD_AVOIDANCE` | User clicked "Ignore / Dismiss" |

---

## Team Push Checklist

- [ ] `cp backend/.env.example backend/.env` and fill in credentials
- [ ] MySQL server running locally or remote URL set in `DATABASE_URL`
- [ ] `python3.11 seed.py` — only needs to run once per environment
- [ ] `python3.11 test_integration.py` — all 3 tests green before demo

---

*Built with FastAPI · SQLAlchemy · Google Gemini · Python 3.11*