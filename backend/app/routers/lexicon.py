import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from google import genai

from app.config import GEMINI_MODEL, GOOGLE_API_KEY
from app.database import get_db
from app.models import Lexicon, RecommendedVocabulary
from app.schemas import LexiconEntry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lexicon", tags=["Lexicon"])

_client = genai.Client(api_key=GOOGLE_API_KEY)


@router.get("/word/{word_id}", response_model=LexiconEntry)
def get_word_by_id(word_id: int, db: Session = Depends(get_db)):
    entry = db.query(Lexicon).filter(Lexicon.word_id == word_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail=f"word_id={word_id} not in lexicon")
    return LexiconEntry.model_validate(entry)


@router.get("/define/{word}", response_model=LexiconEntry)
def define_word(word: str, db: Session = Depends(get_db)):
    clean_word = word.lower().strip()
    existing = db.query(Lexicon).filter(Lexicon.word == clean_word).first()
    if existing:
        return LexiconEntry.model_validate(existing)

    prompt = f"""\
Provide a concise lexicon entry for the Dutch word "{clean_word}".
Return ONLY a valid JSON object with this exact structure:
{{
  "word": "{clean_word}",
  "translation": "English translation (keep it short, 1-5 words)",
  "cefr_level": "A1|A2|B1|B2|C1|C2",
  "examples": [
    {{"nl": "Dutch example sentence using the word", "en": "English translation of that sentence"}},
    {{"nl": "Another Dutch example", "en": "Its English translation"}}
  ],
  "use_cases": [
    {{"nl": "Context sentence showing typical use", "en": "English translation"}},
    {{"nl": "Another use case", "en": "English translation"}}
  ]
}}
"""
    try:
        response = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)
    except Exception as e:
        logger.error(f"[Lexicon/define] Gemini failed for '{clean_word}': {e}")
        raise HTTPException(status_code=502, detail=f"Could not generate definition: {e}")

    new_entry = Lexicon(
        word=data.get("word", clean_word),
        translation=data.get("translation", "—"),
        cefr_level=data.get("cefr_level", "B1"),
        examples=data.get("examples", []),
        use_cases=data.get("use_cases", []),
    )
    db.add(new_entry)
    try:
        db.commit()
        db.refresh(new_entry)
    except Exception:
        db.rollback()
        existing = db.query(Lexicon).filter(Lexicon.word == clean_word).first()
        if existing:
            return LexiconEntry.model_validate(existing)
        raise

    logger.info(f"[Lexicon/define] New word added: '{clean_word}' ({new_entry.cefr_level})")
    return LexiconEntry.model_validate(new_entry)
