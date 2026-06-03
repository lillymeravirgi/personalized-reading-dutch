import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.krs_service import run_krs
from app.models import RecommendedVocabulary
from app.schemas import KRSRunResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/krs", tags=["KRS"])

BLUE_WORD_THRESHOLD = 25


def _maybe_trigger_krs(user_id: str) -> None:
    db = SessionLocal()
    try:
        count = (
            db.query(RecommendedVocabulary)
            .filter(RecommendedVocabulary.user_id == user_id)
            .count()
        )
        if count < BLUE_WORD_THRESHOLD:
            logger.info(
                f"[KRS-auto] user={user_id} has only {count} Blue words "
                f"(< {BLUE_WORD_THRESHOLD}); running KRS"
            )
            run_krs(user_id=user_id, db=db)
    except Exception as e:
        logger.error(f"[KRS-auto] failed for user={user_id}: {e}")
    finally:
        db.close()


@router.post("/run/{user_id}", response_model=KRSRunResponse)
def trigger_krs(user_id: str, db: Session = Depends(get_db)):
    try:
        result = run_krs(user_id=user_id, db=db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return KRSRunResponse(**result)


@router.post("/check/{user_id}")
def check_and_trigger(user_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_maybe_trigger_krs, user_id)
    return {"message": f"KRS check queued for {user_id}"}
