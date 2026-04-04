"""
Integration Test Script — run with Python 3.11
Usage:  python3.11 test_integration.py
"""
import sys
import json
import time

# ── 1. Database connectivity ──────────────────────────────────────────────────
print("\n" + "═" * 60)
print("  TEST 1 — DATABASE CONNECTIVITY")
print("═" * 60)

try:
    from app.database import SessionLocal
    from app.models import User, Lexicon, ReadingSession

    db = SessionLocal()
    user_count = db.query(User).count()
    lex_count  = db.query(Lexicon).count()
    sess_count = db.query(ReadingSession).count()
    db.close()

    print(f"  ✓ Connected to MySQL reading_db")
    print(f"    Users    : {user_count}")
    print(f"    Lexicon  : {lex_count} words")
    print(f"    Sessions : {sess_count}")
    DB_OK = True
except Exception as e:
    print(f"  ✗ DB failed: {e}")
    DB_OK = False

# ── 2. Gemini API ─────────────────────────────────────────────────────────────
print("\n" + "═" * 60)
print("  TEST 2 — GEMINI API KEY")
print("═" * 60)

try:
    from google import genai
    from app.config import GOOGLE_API_KEY, GEMINI_MODEL

    client = genai.Client(api_key=GOOGLE_API_KEY)
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=(
            "Write ONE Dutch sentence using the word [[fiets]]. "
            "Return ONLY the sentence with the word in [[double brackets]]."
        ),
    )
    output = resp.text.strip()
    has_brackets = "[[" in output and "]]" in output
    print(f"  ✓ Gemini responded")
    print(f"    Output       : {output[:100]}{'…' if len(output)>100 else ''}")
    print(f"    Has [[...]]  : {'✓' if has_brackets else '✗ MISSING — check prompt'}")
    GEMINI_OK = True
except Exception as e:
    print(f"  ✗ Gemini failed: {e}")
    GEMINI_OK = False

# ── 3. API endpoint — /session/generate ──────────────────────────────────────
print("\n" + "═" * 60)
print("  TEST 3 — POST /session/generate  (needs server running)")
print("═" * 60)

try:
    import urllib.request

    payload = json.dumps({
        "user_id": "u_014",
        "K": 0.7,
        "narrative_style": "Storytelling",
        "word_count_range": "80-100",
        "condition": "ADAPTIVE",
    }).encode()

    req = urllib.request.Request(
        "http://localhost:8000/session/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as resp:
        status = resp.status
        body   = json.loads(resp.read().decode())
    elapsed = time.time() - t0

    title   = body.get("title", "(no title)")
    content = body.get("content", "")
    sess_id = body.get("session_id")
    has_brackets = "[[" in content

    print(f"  ✓ HTTP {status}  ({elapsed:.1f}s)")
    print(f"    session_id   : {sess_id}")
    print(f"    title        : {title}")
    print(f"    content      : {content[:120]}…")
    print(f"    Has [[…]]    : {'✓' if has_brackets else '✗'}")
    API_OK = True
except Exception as e:
    print(f"  ✗ API call failed: {e}")
    print("    (Is the server running on port 8000?)")
    API_OK = False

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "═" * 60)
print("  RESULTS")
print("═" * 60)
print(f"  Database : {'✓ PASS' if DB_OK     else '✗ FAIL'}")
print(f"  Gemini   : {'✓ PASS' if GEMINI_OK else '✗ FAIL'}")
print(f"  API      : {'✓ PASS' if API_OK    else '✗ FAIL'}")
print()

all_ok = DB_OK and GEMINI_OK and API_OK
sys.exit(0 if all_ok else 1)
