"""
seed.py — Initial data loader for dev.db.

Idempotent: existing rows are skipped.

Seeds:
  - 30-word Dutch lexicon (A1-B1)
  - 6 test accounts (test01–test06), email = username@leeswijs.local
    Default password == username (e.g. test01 / test01).
    onboarding_completed = True so test accounts go straight to /home.
"""
from __future__ import annotations

import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.database import Base, SessionLocal, engine
from app.models import Lexicon, User


def hash_password(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
#  1. Schema init
# ─────────────────────────────────────────────────────────────────────────────
print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("  tables ready")

db = SessionLocal()


# ─────────────────────────────────────────────────────────────────────────────
#  2. Lexicon — 30 Dutch words A1-B1
# ─────────────────────────────────────────────────────────────────────────────
from lexicon_data import LEXICON_DATA

print("Seeding lexicon...")
for entry in LEXICON_DATA:
    exists = db.query(Lexicon).filter(Lexicon.word == entry["word"]).first()
    if not exists:
        db.add(Lexicon(**entry))
db.commit()
print(f"  {len(LEXICON_DATA)} words processed")


# ─────────────────────────────────────────────────────────────────────────────
#  3. Test accounts — for internal team use only
# ─────────────────────────────────────────────────────────────────────────────
TEST_ACCOUNTS = [
    {"user_id": f"test_{i:02d}", "email": f"test{i:02d}@leeswijs.local",
     "password": f"test{i:02d}", "display_name": f"Tester {i:02d}", "cefr": "B1"}
    for i in range(1, 7)
]

print("Seeding test accounts...")
for row in TEST_ACCOUNTS:
    user = db.query(User).filter(User.user_id == row["user_id"]).first()
    if not user:
        db.add(User(
            user_id=row["user_id"],
            email=row["email"],
            username=row["email"],
            password_hash=hash_password(row["password"]),
            display_name=row["display_name"],
            estimated_cefr=row["cefr"],
            onboarding_completed=True,   # skip onboarding for test accounts
        ))
db.commit()
print(f"  {len(TEST_ACCOUNTS)} test accounts processed")

db.close()

print("\nSeed complete.")
print("  Test accounts: test01@leeswijs.local / test01  …  test06@leeswijs.local / test06")
print("  Real participants register via /register and go through onboarding.")
