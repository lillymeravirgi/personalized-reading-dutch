from app.database import SessionLocal
from app.routers.onboarding import select_onboarding_words
db = SessionLocal()
class DummyTasks:
    def add_task(self, *args, **kwargs): pass

try:
    print(select_onboarding_words("team_kim", DummyTasks(), False, 1, db))
except Exception as e:
    print("Error:", e)
