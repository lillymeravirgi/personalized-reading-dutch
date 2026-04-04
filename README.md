# 🇳🇱 Dutch Adaptive Storyteller

An AI-powered personalised Dutch reading platform for language-learning research. The system generates CEFR-aligned Dutch texts with vocabulary highlighted by learning status (**Blue** = new, **Yellow** = currently learning), driven by each learner's profile and a Gemini-powered knowledge recommender.

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Clone & Project Structure](#2-clone--project-structure)
3. [Environment Setup (.env)](#3-environment-setup-env)
4. [Database Setup (MySQL)](#4-database-setup-mysql)
5. [Running the Full Browser App](#5-running-the-full-browser-app)
6. [Running the Terminal Prototype](#6-running-the-terminal-prototype)
7. [Running the Integration Test](#7-running-the-integration-test)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Backend engine |
| Node.js | 18+ | React frontend |
| MySQL | 8.0+ | Database server |
| Google AI Studio account | — | Free Gemini API key |

Get your free Gemini API key → **https://aistudio.google.com**

---

## 2. Clone & Project Structure

```bash
git clone <your-repo-url>
cd personalized-reading-dutch
```

```
personalized-reading-dutch/
├── backend/
│   ├── app/              # FastAPI routers, models, services
│   ├── main.py           # API entry point
│   ├── seed.py           # Populates DB with users & vocabulary
│   ├── run_engine.py     # Terminal prototype (standalone)
│   ├── test_integration.py  # API + Gemini sanity check
│   ├── requirements.txt
│   └── .env.example      # ← copy this to .env and fill in
└── frontend/
    ├── src/
    │   ├── pages/        # LandingPage, InteractiveReader
    │   └── api/client.js # Axios bridge to the backend
    └── package.json
```

---

## 3. Environment Setup (.env)

The backend reads secrets from a `.env` file. **This file is never committed to git.**

```bash
cd backend
cp .env.example .env
```

Now open `backend/.env` and fill in your values:

```env
# Your MySQL connection — replace with your actual password and DB name
DATABASE_URL=mysql+pymysql://root:YOUR_MYSQL_PASSWORD@localhost/reading_db

# Your Gemini API key from https://aistudio.google.com
GOOGLE_API_KEY=your_gemini_api_key_here

# Gemini model (leave as-is unless you want to change it)
GEMINI_MODEL=gemini-2.5-flash
```

---

## 4. Database Setup (MySQL)

**4a. Create the database** (one-time setup):
```sql
-- In MySQL shell or Workbench:
CREATE DATABASE reading_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**4b. Install backend dependencies:**
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**4c. Seed the database** (creates all tables + 3 demo users + vocabulary):
```bash
python seed.py
```

Expected output:
```
✅ Schema created.
✅ Lexicon: 30 words loaded.
✅ Users created: Sophie (A1), Lars (A2), Rowaid (B1)
✅ Seed complete.
```

---

## 5. Running the Full Browser App

You need **two terminals open at the same time**.

### Terminal 1 — Backend API
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```
✅ Ready when you see: `Application startup complete.`

### Terminal 2 — Frontend
```bash
cd frontend
npm install          # first time only
npm start
```
✅ Ready when you see: `Compiled successfully! Local: http://localhost:3000`

### Open in browser
```
http://localhost:3000
```

> **Port conflict?** If port 3000 is taken, run this first:
> ```bash
> kill -9 $(lsof -ti :3000) 2>/dev/null
> ```
> Then run `npm start` again.

### Using the app
1. **Select a learner** from the dropdown (Sophie / Lars / Rowaid)
2. **Type a topic** (optional — e.g. "Buying a bicycle in Amsterdam")
3. **Choose a narrative style** (Storytelling, Horror, Comedy…)
4. Click **✦ Generate Story** — takes ~10–20 seconds
5. Click any **blue** or **yellow** word to see its definition and translation

---

## 6. Running the Terminal Prototype

The terminal prototype generates a story end-to-end with full prompt transparency — no browser needed.

```bash
cd backend
source venv/bin/activate
python run_engine.py
```

You will see:
- A menu to choose a user (Sophie / Lars / Rowaid)
- The full prompt sent to Gemini printed to the terminal
- The generated Dutch story with `[[Blue]]` and `((Yellow))` word markup
- Confirmation that the session was saved to the database

---

## 7. Running the Integration Test

Verifies that the Gemini API key is valid and that the backend can generate a sentence.

```bash
cd backend
source venv/bin/activate
python test_integration.py
```

A passing test prints a Dutch sentence and exits with code 0. If you see a `429` (quota) or `404` (model name) error, check your `.env` values.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Could not load users` in browser | Backend is not running — start `uvicorn` first |
| Port 3000 already in use | Run `kill -9 $(lsof -ti :3000)` then `npm start` |
| `GOOGLE_API_KEY must be set` | Fill in `backend/.env` — see Step 3 |
| `Access denied for user 'root'` | Wrong MySQL password in `DATABASE_URL` |
| `429 RESOURCE_EXHAUSTED` | Gemini free-tier quota hit — wait 1 minute and retry |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` inside the venv |