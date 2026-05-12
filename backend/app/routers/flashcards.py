import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Lexicon, RecommendedVocabulary, UserVocabularyVector, VocabStatus
from app.krs_service import run_krs
from app.schemas import LexiconEntry

router = APIRouter(prefix="/flashcards", tags=["Flashcards"])


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _map_examples(entry) -> list[dict]:
    examples = entry.examples or []
    if isinstance(examples, list):
        result = [
            ex for ex in examples
            if isinstance(ex, dict) and "nl" in ex and "en" in ex
        ]
        if result:
            return result
    return [{"nl": entry.word, "en": entry.translation}]


def _row_to_card(row: UserVocabularyVector) -> dict:
    lex = row.lexicon_entry
    return {
        "wordId":         str(lex.word_id),
        "dutch":          lex.word,
        "english":        lex.translation,
        "examples":       _map_examples(lex),
        "difficulty":     max(0.0, min(1.0, 1.0 - row.mastery_score)),
        "mode":           "review" if row.status == VocabStatus.MASTERED else "learning",
        "nextReviewDate": row.next_review_at.isoformat() if row.next_review_at else None,
        "reviewInterval": row.review_interval_days,
    }


# ─────────────────────────────────────────────
#  GET /flashcards  — all LEARNING words
# ─────────────────────────────────────────────

@router.get("")
def list_flashcards(user_id: str, db: Session = Depends(get_db)):
    """
    Return all LEARNING words, due-first ordering.
    A word is 'due' if next_review_at <= now() (strict UTC).
    """
    from sqlalchemy import or_
    now = datetime.datetime.utcnow()

    due_rows = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.status == VocabStatus.LEARNING,
            or_(
                UserVocabularyVector.next_review_at <= now,
                UserVocabularyVector.next_review_at.is_(None)
            )
        )
        .join(UserVocabularyVector.lexicon_entry)
        .order_by(UserVocabularyVector.review_priority.desc())
        .all()
    )

    # Calculate reviewed_today (need all rows for this day)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    reviewed_today = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.last_reviewed_at >= today_start
        )
        .count()
    )

    return {
        "cards":          [_row_to_card(r) for r in due_rows],
        "due_count":      len(due_rows),
        "not_due_count":  0,  # We don't fetch these anymore
        "reviewed_today": reviewed_today,
        "total":          len(due_rows),
    }



# ─────────────────────────────────────────────
#  GET /flashcards/discover-prefetch  — 50-word reservoir, instant read
# ─────────────────────────────────────────────


@router.get("/discover-prefetch")
def discover_prefetch(user_id: str, db: Session = Depends(get_db)):
    """
    FIX 1 — Non-blocking: returns instantly; pure database read.
    FIX 3 — SQL anti-join: single query replaces two queries + Python filter.
    """
    SERVE_LIMIT   = 50

    # FIX 3: SQL left anti-join — only rows in RecommendedVocabulary that have
    # NO matching row in UserVocabularyVector for this user.
    usable_recs = (
        db.query(RecommendedVocabulary)
        .outerjoin(
            UserVocabularyVector,
            (RecommendedVocabulary.word_id == UserVocabularyVector.word_id)
            & (UserVocabularyVector.user_id == user_id),
        )
        .filter(
            RecommendedVocabulary.user_id == user_id,
            UserVocabularyVector.word_id == None,  # noqa: E711
        )
        .join(RecommendedVocabulary.lexicon_entry)
        .order_by(RecommendedVocabulary.recommended_at.desc())
        .all()
    )
    usable_count = len(usable_recs)

    words = [
        {
            "wordId":    str(rec.lexicon_entry.word_id),
            "dutch":     rec.lexicon_entry.word,
            "english":   rec.lexicon_entry.translation,
            "examples":  _map_examples(rec.lexicon_entry),
            "cefrLevel": rec.lexicon_entry.cefr_level,
        }
        for rec in usable_recs[:SERVE_LIMIT]
    ]

    return {"words": words, "remaining": usable_count}



# ─────────────────────────────────────────────
#  POST /flashcards/refill-check  — Trigger on exit
# ─────────────────────────────────────────────

@router.post("/refill-check")
def refill_check(user_id: str, db: Session = Depends(get_db)):
    """
    Called by the frontend (via navigator.sendBeacon) when leaving Flashcards.
    If the usable reservoir is under 25, it triggers a synchronous refill here,
    which is fine since the user has already navigated away.
    """
    LOW_WATERMARK = 25
    usable_count = (
        db.query(RecommendedVocabulary)
        .outerjoin(
            UserVocabularyVector,
            (RecommendedVocabulary.word_id == UserVocabularyVector.word_id)
            & (UserVocabularyVector.user_id == user_id),
        )
        .filter(
            RecommendedVocabulary.user_id == user_id,
            UserVocabularyVector.word_id == None,  # noqa: E711
        )
        .count()
    )

    if usable_count < LOW_WATERMARK:
        try:
            run_krs(user_id=user_id, db=db)
            return {"status": "refilled"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    return {"status": "adequate"}


# ─────────────────────────────────────────────
#  POST /flashcards/discover  — trigger fresh KRS (still available as fallback)
# ─────────────────────────────────────────────

class DiscoverRequest(BaseModel):
    user_id: str


@router.post("/discover")
def discover_new_words(req: DiscoverRequest, db: Session = Depends(get_db)):
    """Trigger a fresh KRS run and return up to 20 new words."""
    try:
        run_krs(user_id=req.user_id, db=db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KRS failed: {e}")

    recs = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == req.user_id)
        .join(RecommendedVocabulary.lexicon_entry)
        .order_by(RecommendedVocabulary.recommended_at.desc())
        .limit(20)
        .all()
    )

    learning_ids = {
        v.word_id for v in db.query(UserVocabularyVector).filter(
            UserVocabularyVector.user_id == req.user_id
        ).all()
    }

    words = []
    for rec in recs:
        lex = rec.lexicon_entry
        if lex.word_id in learning_ids:
            continue
        words.append({
            "wordId":   str(lex.word_id),
            "dutch":    lex.word,
            "english":  lex.translation,
            "examples": _map_examples(lex),
        })

    return {"words": words}


# ─────────────────────────────────────────────
#  POST /flashcards/review  — schedule / forgot
# ─────────────────────────────────────────────

class ReviewRequest(BaseModel):
    user_id: str
    word_id: int
    remembered: bool
    interval_days: int | None = None   # 0=today, 1, 2, 4, 7, 30


@router.post("/review")
def review_flashcard(req: ReviewRequest, db: Session = Depends(get_db)):
    row = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == req.user_id,
            UserVocabularyVector.word_id == req.word_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    row.exposure_count += 1
    row.last_reviewed_at = datetime.datetime.utcnow()

    if req.remembered:
        row.mastery_score = min(1.0, row.mastery_score + 0.25)
        days = req.interval_days if req.interval_days is not None else 1
        row.review_interval_days = days
        if days == 0:
            row.next_review_at = datetime.datetime.utcnow() + datetime.timedelta(hours=4)
        else:
            row.next_review_at = datetime.datetime.utcnow() + datetime.timedelta(days=days)
    else:
        # "Forgot" — lower mastery but keep LEARNING; do NOT advance next_review_at far out
        row.mastery_score = max(0.0, row.mastery_score - 0.15)
        row.status = VocabStatus.LEARNING
        row.next_review_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
        row.review_interval_days = None

    db.commit()
    return {"success": True}


# ─────────────────────────────────────────────
#  POST /flashcards/mark-known  — LEARNING → MASTERED
# ─────────────────────────────────────────────

class MarkKnownRequest(BaseModel):
    user_id: str
    word_id: int


@router.post("/mark-known")
def mark_known_flashcard(req: MarkKnownRequest, db: Session = Depends(get_db)):
    """Move a word from LEARNING to MASTERED and evict it from the reservoir."""
    row = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == req.user_id,
            UserVocabularyVector.word_id == req.word_id,
        )
        .first()
    )
    if row:
        row.status           = VocabStatus.MASTERED
        row.mastery_score    = 1.0
        row.last_reviewed_at = datetime.datetime.utcnow()
        row.next_review_at   = datetime.datetime.utcnow() + datetime.timedelta(days=30)
    else:
        db.add(UserVocabularyVector(
            user_id=req.user_id,
            word_id=req.word_id,
            status=VocabStatus.MASTERED,
            mastery_score=1.0,
            exposure_count=1,
            last_reviewed_at=datetime.datetime.utcnow(),
            next_review_at=datetime.datetime.utcnow() + datetime.timedelta(days=30),
        ))

    # FIX 2: Evict from reservoir so the low-watermark count stays accurate
    db.query(RecommendedVocabulary).filter(
        RecommendedVocabulary.user_id == req.user_id,
        RecommendedVocabulary.word_id == req.word_id,
    ).delete(synchronize_session=False)

    db.commit()
    return {"success": True}


# ─────────────────────────────────────────────
#  POST /flashcards/add-to-learn  — move word from reservoir → UserVocabularyVector
# ─────────────────────────────────────────────

class AddToLearnRequest(BaseModel):
    user_id: str
    word_id: int
    interval_days: int = 1


@router.post("/add-to-learn")
def add_to_learn(req: AddToLearnRequest, db: Session = Depends(get_db)):
    """
    Atomic transition: delete from RecommendedVocabulary, insert into
    UserVocabularyVector with LEARNING status and chosen SRS interval.
    """
    lex = db.query(Lexicon).filter(Lexicon.word_id == req.word_id).first()
    if not lex:
        raise HTTPException(status_code=404, detail="Word not found")

    # Step 1: Remove from reservoir
    rec = db.query(RecommendedVocabulary).filter(
        RecommendedVocabulary.user_id == req.user_id,
        RecommendedVocabulary.word_id == req.word_id,
    ).first()
    if rec:
        db.delete(rec)

    # Step 2: Upsert into UserVocabularyVector
    now = datetime.datetime.utcnow()
    if req.interval_days == 0:
        next_review = now - datetime.timedelta(minutes=1)
    else:
        next_review = now + datetime.timedelta(days=req.interval_days)
    existing = db.query(UserVocabularyVector).filter(
        UserVocabularyVector.user_id == req.user_id,
        UserVocabularyVector.word_id == req.word_id,
    ).first()

    if existing:
        if existing.status == VocabStatus.MASTERED:
            db.commit()
            return {"success": True, "message": "Already mastered"}
        existing.status               = VocabStatus.LEARNING
        existing.review_interval_days = req.interval_days
        existing.next_review_at       = next_review
        existing.exposure_count      += 1
    else:
        db.add(UserVocabularyVector(
            user_id=req.user_id,
            word_id=req.word_id,
            status=VocabStatus.LEARNING,
            mastery_score=0.0,
            exposure_count=1,
            review_interval_days=req.interval_days,
            next_review_at=next_review,
        ))

    db.commit()
    return {"success": True}
