#!/usr/bin/env python3.11
"""
run_engine.py — Transparent Multi-User Storyteller (Interactive Terminal Mode)
=============================================================================

Usage:
  python3.11 run_engine.py          # interactive multi-user REPL
  python3.11 run_engine.py --once   # single run (prompts for name + topic)

Pipeline per generation:
  1. Select user by name (Sophie / Lars / Rowaid).
  2. Type a topic.
  3. Blue Words  → 5 random lexicon words at the user's CEFR level NOT yet known.
  4. Yellow Words → 3-5 random words from the user's LEARNING list.
  5. Print full system instruction + user prompt sent to Gemini.
  6. Print the generated Dutch story (Blue = [[word]], Yellow = ((word))).
  7. Save session to DB.
"""
from __future__ import annotations

import json
import math
import os
import random
import re
import sys
import textwrap
import time
from typing import Optional

# ── Bootstrap: add backend/ to sys.path ──────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from google import genai

from app.config import GOOGLE_API_KEY, GEMINI_MODEL
from app.database import SessionLocal
from app.models import (
    ConditionType, Lexicon, ReadingSession,
    TopicStatus, User, UserTopic,
    UserVocabularyVector, VocabStatus,
)
from app.session_generator import _SYSTEM_INSTRUCTION

# ── ANSI colours ──────────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[96m"
YELLOW = "\033[93m"
GREEN  = "\033[92m"
BLUE   = "\033[94m"
DIM    = "\033[2m"
RED    = "\033[91m"
MAGENTA= "\033[95m"

_client = genai.Client(api_key=GOOGLE_API_KEY)
SEP     = "─" * 70

# ── Name → user_id registry (matches seed.py) ─────────────────────────────────
NAME_MAP: dict[str, str] = {
    "sophie": "u_A1",
    "lars":   "u_A2",
    "rowaid": "u_014",
}
DISPLAY_NAMES = ["Sophie", "Lars", "Rowaid"]


# ─────────────────────────────────────────────────────────────────────────────
#  Utility helpers
# ─────────────────────────────────────────────────────────────────────────────

def _header(title: str, colour: str = CYAN) -> None:
    print(f"\n{colour}{BOLD}{SEP}")
    print(f"  {title}")
    print(f"{SEP}{RESET}")


def _sanity_check() -> bool:
    """Quick ping: ask Gemini to say 'Hallo'. Prints available models on 404."""
    print(f"  {DIM}⟳ Sanity-checking {GEMINI_MODEL}…{RESET}", end=" ", flush=True)
    try:
        resp = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents="Just say the single Dutch word: Hallo",
        )
        print(f"{GREEN}✓ Got: '{resp.text.strip()}'{RESET}")
        return True
    except Exception as e:
        msg = str(e)
        print(f"{RED}✗ {e.__class__.__name__}: {msg[:100]}{RESET}")
        if "404" in msg or "NOT_FOUND" in msg:
            print(f"\n  {YELLOW}Available models on your API key:{RESET}")
            try:
                models = [m.name for m in _client.models.list()]
                for name in sorted(models):
                    print(f"    {DIM}{name}{RESET}")
            except Exception as list_err:
                print(f"    {RED}Could not list models: {list_err}{RESET}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
#  User & Vocabulary Loading
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_user_context(user_id: str) -> dict:
    """Load user profile, topics, Blue and Yellow word candidates from DB."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise ValueError(f"User '{user_id}' not found in database.")

        interests = [
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
            .all()
        ]
        hated = {
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.HATED)
            .all()
        }

        # ── Yellow words: already in user_vocab with LEARNING status ─────────
        yellow_recs = (
            db.query(UserVocabularyVector)
            .filter(
                UserVocabularyVector.user_id == user_id,
                UserVocabularyVector.status == VocabStatus.LEARNING,
            )
            .join(Lexicon)
            .all()
        )
        all_yellow_words = [r.lexicon_entry.word for r in yellow_recs]

        # Pick 3-5 yellow words randomly
        k_yellow = random.randint(3, min(5, max(3, len(all_yellow_words))))
        yellow_words = random.sample(all_yellow_words, min(k_yellow, len(all_yellow_words)))

        # ── Blue words: same CEFR level, NOT in user_vocab at all ────────────
        known_word_ids = {r.word_id for r in yellow_recs}
        all_level_words = (
            db.query(Lexicon)
            .filter(Lexicon.cefr_level == user.estimated_cefr)
            .all()
        )
        blue_candidates = [w.word for w in all_level_words if w.word_id not in known_word_ids]
        blue_words = random.sample(blue_candidates, min(5, len(blue_candidates)))

        return {
            "db": db,
            "user": user,
            "interests": interests,
            "hated": hated,
            "blue_words": blue_words,
            "yellow_words": yellow_words,
        }
    except Exception:
        db.close()
        raise


# ─────────────────────────────────────────────────────────────────────────────
#  Prompt Builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(
    user: User,
    topic: str,
    blue_words: list[str],
    yellow_words: list[str],
    narrative_style: str = "Storytelling",
    word_count_range: str = "150-200",
) -> str:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    return f"""\
### USER PROFILE
- Age: {user.age}
- Location: {user.location} (Incorporate local landmarks or regional context)
- Education Level: {user.education_level}
- Learning Goal: {user.learning_purpose}
- Current CEFR Level: {user.estimated_cefr} Dutch

### CONTENT CONFIGURATION
- Selected Topic: {topic}
- Narrative Style: {narrative_style}

### TARGET VOCABULARY — MANDATORY INJECTION
1. BLUE WORDS (New — not yet known to user): {blue_str}
2. YELLOW WORDS (Active Learning — already encountered): {yellow_str}

### INSTRUCTIONS
Write a cohesive Dutch text of approximately {word_count_range} words.
- Use EVERY Blue word at least once. Wrap each one in double square brackets: [[word]]
- Use EVERY Yellow word at least once. Wrap each one in double round brackets: ((word))
- Keep vocabulary and grammar at or below {user.estimated_cefr} level.
- Relate the text naturally to the user's goal of '{user.learning_purpose}'.

### OUTPUT SPECIFICATION
Return ONLY a valid JSON object:
{{
  "title": "A catchy Dutch headline",
  "content": "Full Dutch text with [[blue_words]] and ((yellow_words)) marked",
  "metadata": {{
    "topic_used": "{topic}",
    "cefr_actual": "{user.estimated_cefr}",
    "injected_blue_count": {len(blue_words)},
    "injected_yellow_count": {len(yellow_words)}
  }}
}}
"""


# ─────────────────────────────────────────────────────────────────────────────
#  Gemini Call (with retry)
# ─────────────────────────────────────────────────────────────────────────────

def _call_gemini(prompt: str) -> dict:
    last_err: Optional[Exception] = None
    for attempt in range(1, 4):
        try:
            response = _client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config={"system_instruction": _SYSTEM_INSTRUCTION},
            )
            text = response.text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            return json.loads(text)
        except Exception as e:
            last_err = e
            if attempt < 3:
                print(f"  {DIM}⟳ Attempt {attempt} failed — retrying in 2s… ({e.__class__.__name__}){RESET}")
                time.sleep(2)
    assert last_err is not None
    raise last_err


# ─────────────────────────────────────────────────────────────────────────────
#  DB Save
# ─────────────────────────────────────────────────────────────────────────────

def _save_session(db, user_id: str, topic: str, result: dict) -> int:
    session = ReadingSession(
        user_id=user_id,
        title=result.get("title", ""),
        content=result.get("content", ""),
        topic_used=topic,
        condition=ConditionType.ADAPTIVE,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session.session_id


# ─────────────────────────────────────────────────────────────────────────────
#  Core pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _run_once(user_id: str, topic: Optional[str] = None) -> None:
    """Full pipeline: fetch → build → call → print → save."""
    ctx = _fetch_user_context(user_id)
    db, user = ctx["db"], ctx["user"]

    # ── User context printout ────────────────────────────────────────────────
    _header(f"USER CONTEXT  ({user.user_id})", BLUE)
    print(f"  {BOLD}Name/ID   :{RESET}  {user.user_id}")
    print(f"  {BOLD}Location  :{RESET}  {user.location}")
    print(f"  {BOLD}Level     :{RESET}  {user.estimated_cefr}")
    print(f"  {BOLD}Goal      :{RESET}  {user.learning_purpose}")
    print(f"  {BOLD}Interests :{RESET}  {', '.join(ctx['interests']) or '(none)'}")

    # ── Target words breakdown ───────────────────────────────────────────────
    _header("TARGET WORDS FOR THIS SESSION", MAGENTA)
    print(f"  {BOLD}{BLUE}🔵 Blue (NEW)   :{RESET}  {', '.join(ctx['blue_words']) or '(none)'}")
    print(f"  {BOLD}{YELLOW}🟡 Yellow (LEARNING):{RESET}  {', '.join(ctx['yellow_words']) or '(none)'}")
    print(f"\n  {DIM}Blue → [[word]]   Yellow → ((word)){RESET}")

    # ── Topic selection ──────────────────────────────────────────────────────
    if not topic:
        candidates = [t for t in ctx["interests"] if t not in ctx["hated"]]
        topic = random.choice(candidates) if candidates else "dagelijks leven"

    # ── Build prompt ─────────────────────────────────────────────────────────
    prompt = _build_prompt(
        user=user,
        topic=topic,
        blue_words=ctx["blue_words"],
        yellow_words=ctx["yellow_words"],
    )

    _header("SYSTEM INSTRUCTION  (sent to Gemini)", DIM)
    for line in _SYSTEM_INSTRUCTION.splitlines():
        print(f"  {DIM}{line}{RESET}")

    _header("USER PROMPT  (sent to Gemini)", YELLOW)
    for line in prompt.splitlines():
        print(f"  {YELLOW}{line}{RESET}")

    # ── Call Gemini ───────────────────────────────────────────────────────────
    _header(f"⟳  Calling {GEMINI_MODEL}…", CYAN)
    try:
        result = _call_gemini(prompt)
    except Exception as e:
        print(f"\n  {RED}✗ Gemini error: {e}{RESET}\n")
        db.close()
        return

    # ── Print story ───────────────────────────────────────────────────────────
    _header("GENERATED STORY", GREEN)
    title   = result.get("title", "(no title)")
    content = result.get("content", "")
    meta    = result.get("metadata", {})

    print(f"\n  {BOLD}{GREEN}{title}{RESET}\n")
    # Colour-code [[blue]] and ((yellow)) inline
    coloured = re.sub(r"\[\[(.+?)\]\]", f"{BLUE}[[\\1]]{RESET}", content)
    coloured = re.sub(r"\(\((.+?)\)\)", f"{YELLOW}((\\1)){RESET}", coloured)
    wrapped  = textwrap.fill(coloured, width=80, initial_indent="  ", subsequent_indent="  ")
    print(wrapped)
    print(f"\n  {DIM}Topic: {meta.get('topic_used')}  |  CEFR: {meta.get('cefr_actual')}  "
          f"|  Blue injected: {meta.get('injected_blue_count', '?')}  "
          f"Yellow injected: {meta.get('injected_yellow_count', '?')}{RESET}")

    # ── Save ──────────────────────────────────────────────────────────────────
    try:
        sid = _save_session(db, user.user_id, topic, result)
        print(f"\n  {GREEN}✓ Saved to reading_sessions  (session_id={sid}){RESET}")
    except Exception as e:
        print(f"\n  {RED}✗ DB save failed: {e}{RESET}")
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
#  Interactive REPL
# ─────────────────────────────────────────────────────────────────────────────

def _select_user() -> Optional[str]:
    """Prompt for a name, return user_id or None on quit."""
    names_str = "/".join(DISPLAY_NAMES)
    while True:
        try:
            raw = input(f"\n{BOLD}Name [{names_str}] > {RESET}").strip()
        except (KeyboardInterrupt, EOFError):
            return None

        if raw.lower() in ("quit", "exit", "q", ""):
            return None

        uid = NAME_MAP.get(raw.lower())
        if uid:
            return uid

        # Safety catch — Dutch error message as requested
        print(
            f"  {RED}Gebruiker niet gevonden. "
            f"Beschikbare gebruikers: {', '.join(DISPLAY_NAMES)}.{RESET}"
        )


def _interactive_loop() -> None:
    """Multi-user REPL."""
    print(f"\n{BOLD}{CYAN}{'═'*70}")
    print("  🇳🇱  Dutch Storyteller Engine  —  Multi-User Interactive Mode")
    print(f"{'═'*70}{RESET}")
    print(f"  {DIM}Users: Sophie (A1 · Social) | Lars (A2 · Work) | Rowaid (B1 · Academic)")
    print(f"  Type 'quit' or press Ctrl-C at any prompt to exit.{RESET}\n")

    if not _sanity_check():
        print(f"  {RED}⚠ Cannot reach Gemini — check API quota/key.{RESET}\n")

    while True:
        # ── Select user ──────────────────────────────────────────────────────
        user_id = _select_user()
        if user_id is None:
            print(f"\n{DIM}Tot ziens!{RESET}\n")
            break

        # ── Select topic ──────────────────────────────────────────────────────
        try:
            raw_topic = input(f"{BOLD}Topic > {RESET}").strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n{DIM}Tot ziens!{RESET}\n")
            break

        if raw_topic.lower() in ("quit", "exit", "q"):
            print(f"\n{DIM}Tot ziens!{RESET}\n")
            break

        topic = raw_topic if raw_topic else None
        _run_once(user_id=user_id, topic=topic)
        print()


# ─────────────────────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    args = sys.argv[1:]
    if "--once" in args:
        # Non-interactive single run
        uid = _select_user()
        if uid:
            try:
                topic_arg = input(f"{BOLD}Topic > {RESET}").strip() or None
            except (KeyboardInterrupt, EOFError):
                topic_arg = None
            _run_once(user_id=uid, topic=topic_arg)
    else:
        _interactive_loop()
