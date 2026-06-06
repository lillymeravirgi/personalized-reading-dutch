from app.database import SessionLocal
from app.routers.onboarding import select_onboarding_words
from app.models import User
db = SessionLocal()
class DummyTasks:
    def add_task(self, *args, **kwargs): pass

user = db.query(User).filter(User.current_condition == "BASELINE").first()
if user:
    print(f"Testing baseline user: {user.user_id}")
    try:
        print(select_onboarding_words(user.user_id, DummyTasks(), False, 1, db))
    except Exception as e:
        print("Error:", e)
