# Flashcard review routes can be added here once scheduling is stored in the backend.
from fastapi import APIRouter

router = APIRouter(prefix="/flashcards", tags=["Flashcards"])
