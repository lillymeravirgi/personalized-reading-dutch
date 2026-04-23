# Assessment routes can be added here when the placement test is moved to the backend.
from fastapi import APIRouter

router = APIRouter(prefix="/assessment", tags=["Assessment"])
