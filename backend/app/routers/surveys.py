from fastapi import APIRouter, HTTPException
from app.schemas import SurveyResponse

router = APIRouter(prefix="/surveys", tags=["Surveys"])


@router.post("")
def submit_survey(payload: SurveyResponse):
    try:
        # TODO: store in DB later
        print("Survey received:", payload.dict())

        return {
            "success": True,
            "data": None
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))