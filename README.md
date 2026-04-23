# LearnDutch

Group project for an HCI course. It is a small web app that generates
short Dutch reading texts with LLM, adapts them to the
learner‘s interests and vocabulary level, and logs how the user
interacts with each word.

The goal of the study is to compare two versions of the same app and see
whether the personalized version changes how students read, how hard it
feels, and how much vocabulary they actually learn.

---

## Research questions

**RQ1.** Does personalized reading content, adapted to a learner's vocabulary level and interests, lead to lower perceived reading difficulty compared to a non-personalized baseline?

**RQ2.** Does the personalization of reading content (interest-based and vocabulary-aware) increase active user engagement compared to a non-personalized baseline?

**RQ3.** Does flashcard-based review of learner-identified unknown vocabulary within an adaptive, vocabulary-aware personalized reading system lead to higher immediate acquisition and 24-hour retention compared to the same review within a non-adaptive reading system?

---

## Stack

- **Backend:** FastAPI · SQLAlchemy · SQLite
- **LLM:** Google Gemini 2.5 Flash
- **Frontend:** React 19 · Vite · TypeScript · Zustand

---

## How to run

You need Python 3.11, Node.js 20+, and a Gemini API key 

### Backend (terminal 1)

```bash
# from the project root
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

cd backend
cp .env.example .env
# open .env and paste your API key after GOOGLE_API_KEY=

python seed.py                          # first time only
uvicorn main:app --port 8000 --reload
```

API docs: http://localhost:8000/docs

### Frontend (terminal 2)

```bash
cd frontend/leeswijs
npm install
npm run dev -- --port 3000
```

App: http://localhost:3000/login

---

## Project structure

```
Dutch learning/
├── README.md
├── .gitignore
├── backend/
│   ├── main.py                
│   ├── seed.py               
│   ├── run_engine.py          
│   ├── test_integration.py    
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
└── frontend/leeswijs/
    └── src/
        ├── App.tsx           
        ├── main.tsx           
        ├── layouts/          
        ├── pages/             
        ├── components/        
        │   ├── reading/
        │   ├── flashcards/
        │   ├── vocab-test/
        │   └── survey/
        ├── hooks/
        ├── services/api.ts    
        ├── store/index.ts     
        ├── mocks/             
        └── types/             
```

---


## Environment variables

`backend/.env` must contain:

```
GOOGLE_API_KEY=your-key-here
DATABASE_URL=sqlite:///./dev.db
GEMINI_MODEL=gemini-2.5-flash
```

`.env` is **per developer** and is gitignored. `.env.example` (with empty
values) is committed so everyone knows what to fill in.


