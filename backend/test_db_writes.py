from app.database import SessionLocal
from app.models import OnboardingWords, UserVocabularyVector
from app.routers.onboarding import mark_word_decision, MarkDecisionRequest
from app.routers.vocabulary import mark_known, MarkKnownRequest

db = SessionLocal()

# 1. Simulate frontend clicking "I know it"
# 1a. markKnown -> Vocab status to MASTERED
req1 = MarkKnownRequest(user_id="KIM", word_id=10)
try:
    mark_known(req1, db)
except Exception as e:
    print("mark_known error:", e)

# 1b. markWordDecision -> OnboardingWords.is_to_be_tested = False
req2 = MarkDecisionRequest(user_id="KIM", word_id=10, study_phase=1, to_be_tested=False)
try:
    mark_word_decision(req2, db)
except Exception as e:
    print("mark_word_decision error:", e)

# 2. Verify state
v = db.query(UserVocabularyVector).filter_by(user_id="KIM", word_id=10).first()
o = db.query(OnboardingWords).filter_by(user_id="KIM", word_id=10).first()

if v:
    print("VocabVector Status:", v.status.name)
if o:
    print("OnboardingWords is_to_be_tested:", o.is_to_be_tested)

