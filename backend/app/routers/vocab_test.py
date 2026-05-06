from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lexicon, ReadingSession, UserVocabularyVector

router = APIRouter(prefix="/vocab-test", tags=["VocabTest"])


class VocabTestResult(BaseModel):
    sessionId: str
    phase: str
    answers: list[dict]
    correct: int
    total: int
    submittedAt: str


def _session_words(session: ReadingSession, db: Session) -> list[Lexicon]:
    content = session.content.lower()
    all_words = db.query(Lexicon).order_by(Lexicon.word_id).all()
    matched = [word for word in all_words if f"[[{word.word.lower()}]]" in content]
    if matched:
        return matched[:5]
    return all_words[:5]


@router.get("/start")
def start_vocab_test(session_id: int, phase: str = "IMMEDIATE", db: Session = Depends(get_db)):
    session = db.query(ReadingSession).filter(ReadingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    words = _session_words(session, db)
    distractors = [word.translation for word in db.query(Lexicon).order_by(Lexicon.word_id).all()]
    fallback = ["development", "choice", "environment", "question", "system"]
    questions = []

    for index, word in enumerate(words):
        options = []
        for option in distractors + fallback:
            if option != word.translation and option not in options:
                options.append(option)
            if len(options) == 3:
                break
        correct_index = index % 4
        options.insert(correct_index, word.translation)
        questions.append(
            {
                "questionId": f"{session_id}-{word.word_id}",
                "wordId": str(word.word_id),
                "dutch": word.word,
                "prompt": f"What does {word.word} mean",
                "options": options,
                "correctIndex": correct_index,
            }
        )

    return {
        "success": True,
        "data": {
            "sessionId": str(session_id),
            "phase": phase,
            "questions": questions,
        },
    }


@router.post("/submit")
def submit_vocab_test(result: VocabTestResult):
    return {"success": True, "data": result.model_dump()}
