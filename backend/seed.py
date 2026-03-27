"""
seed.py — Group "Source of Truth" for reading_db
Run once: python3.11 seed.py
Idempotent: skips rows that already exist.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import Base, engine, SessionLocal
from app.models import (
    Lexicon, TopicStatus, User, UserTopic,
    UserVocabularyVector, VocabStatus,
)

# ─────────────────────────────────────────────────────────────────────────────
#  1. Schema Init
# ─────────────────────────────────────────────────────────────────────────────
print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("  ✓ Tables ready")

db = SessionLocal()

# ─────────────────────────────────────────────────────────────────────────────
#  2. Lexicon — 30 Dutch words A1–B1 (idempotent)
# ─────────────────────────────────────────────────────────────────────────────
LEXICON_DATA = [
    # ── A1 ────────────────────────────────────────────────────────────────────
    {"word": "hallo",       "translation": "hello",                  "cefr_level": "A1",
     "examples": [{"nl": "Hallo, hoe gaat het?", "en": "Hello, how are you?"}],
     "use_cases": [{"nl": "Hallo is een informele begroeting.", "en": "'Hallo' is an informal greeting."}]},

    {"word": "brood",       "translation": "bread",                  "cefr_level": "A1",
     "examples": [{"nl": "Ik eet brood met kaas.", "en": "I eat bread with cheese."}],
     "use_cases": [{"nl": "Ze koopt elke dag vers brood.", "en": "She buys fresh bread every day."}]},

    {"word": "water",       "translation": "water",                  "cefr_level": "A1",
     "examples": [{"nl": "Mag ik een glas water?", "en": "May I have a glass of water?"}],
     "use_cases": [{"nl": "Drink genoeg water op warme dagen.", "en": "Drink enough water on warm days."}]},

    {"word": "huis",        "translation": "house / home",           "cefr_level": "A1",
     "examples": [{"nl": "Ik woon in een groot huis.", "en": "I live in a big house."}],
     "use_cases": [{"nl": "Ze zoekt een huis in het centrum.", "en": "She's looking for a house in the city centre."}]},

    {"word": "fiets",       "translation": "bicycle",                "cefr_level": "A1",
     "examples": [{"nl": "Ik ga op mijn fiets naar school.", "en": "I go to school on my bicycle."}],
     "use_cases": [{"nl": "In Nederland gebruikt iedereen een fiets.", "en": "In the Netherlands everyone uses a bicycle."}]},

    {"word": "boek",        "translation": "book",                   "cefr_level": "A1",
     "examples": [{"nl": "Ik lees een boek.", "en": "I am reading a book."}],
     "use_cases": [{"nl": "Heb jij een goed boek aanbevolen?", "en": "Did you recommend a good book?"}]},

    {"word": "studeren",    "translation": "to study",               "cefr_level": "A1",
     "examples": [{"nl": "Ik studeer aan de universiteit.", "en": "I study at the university."}],
     "use_cases": [{"nl": "Hij wil in Nederland studeren.", "en": "He wants to study in the Netherlands."}]},

    {"word": "eten",        "translation": "to eat / food",          "cefr_level": "A1",
     "examples": [{"nl": "Wij eten samen om zes uur.", "en": "We eat together at six o'clock."}],
     "use_cases": [{"nl": "Wat wil je eten vanavond?", "en": "What do you want to eat tonight?"}]},

    {"word": "familie",     "translation": "family",                 "cefr_level": "A1",
     "examples": [{"nl": "Mijn familie woont in Amsterdam.", "en": "My family lives in Amsterdam."}],
     "use_cases": [{"nl": "Ze bezoekt haar familie elk weekend.", "en": "She visits her family every weekend."}]},

    {"word": "school",      "translation": "school",                 "cefr_level": "A1",
     "examples": [{"nl": "De kinderen gaan naar school.", "en": "The children go to school."}],
     "use_cases": [{"nl": "Hoe laat begint de school?", "en": "What time does school start?"}]},

    # ── A2 ────────────────────────────────────────────────────────────────────
    {"word": "vergadering",  "translation": "meeting",               "cefr_level": "A2",
     "examples": [{"nl": "De vergadering duurt een uur.", "en": "The meeting lasts an hour."}],
     "use_cases": [{"nl": "Tijdens de vergadering bespreken we de resultaten.", "en": "During the meeting we discuss the results."}]},

    {"word": "vertraging",   "translation": "delay",                 "cefr_level": "A2",
     "examples": [{"nl": "De trein heeft tien minuten vertraging.", "en": "The train is ten minutes late."}],
     "use_cases": [{"nl": "Reiziger melden vertraging bij de NS-app.", "en": "Travellers report delays via the NS app."}]},

    {"word": "collega",      "translation": "colleague",             "cefr_level": "A2",
     "examples": [{"nl": "Mijn collega helpt me met het project.", "en": "My colleague helps me with the project."}],
     "use_cases": [{"nl": "We lunchen met collega's op kantoor.", "en": "We have lunch with colleagues at the office."}]},

    {"word": "afspraak",     "translation": "appointment / meeting", "cefr_level": "A2",
     "examples": [{"nl": "Ik heb een afspraak om twee uur.", "en": "I have an appointment at two o'clock."}],
     "use_cases": [{"nl": "Hij vergeet zijn afspraken te noteren.", "en": "He forgets to write down his appointments."}]},

    {"word": "bibliotheek",  "translation": "library",               "cefr_level": "A2",
     "examples": [{"nl": "Ik leen boeken uit de bibliotheek.", "en": "I borrow books from the library."}],
     "use_cases": [{"nl": "Studenten werken rustig in de bibliotheek.", "en": "Students work quietly in the library."}]},

    {"word": "samenwerken",  "translation": "to collaborate",        "cefr_level": "A2",
     "examples": [{"nl": "We moeten samenwerken aan dit project.", "en": "We need to collaborate on this project."}],
     "use_cases": [{"nl": "Samenwerken is essentieel in een team.", "en": "Collaboration is essential in a team."}]},

    {"word": "deadline",     "translation": "deadline",              "cefr_level": "A2",
     "examples": [{"nl": "De deadline voor het essay is vrijdag.", "en": "The essay deadline is Friday."}],
     "use_cases": [{"nl": "Plan je werk zodat je de deadline haalt.", "en": "Plan your work so you meet the deadline."}]},

    {"word": "centrum",      "translation": "city centre",           "cefr_level": "A2",
     "examples": [{"nl": "Het centrum van Maastricht is erg mooi.", "en": "The centre of Maastricht is very beautiful."}],
     "use_cases": [{"nl": "De universiteit ligt vlakbij het centrum.", "en": "The university is close to the city centre."}]},

    {"word": "boodschappen", "translation": "groceries / errands",   "cefr_level": "A2",
     "examples": [{"nl": "Ik doe boodschappen in de supermarkt.", "en": "I do the grocery shopping at the supermarket."}],
     "use_cases": [{"nl": "Maak een lijst voor de boodschappen.", "en": "Make a list for the groceries."}]},

    {"word": "kantoor",      "translation": "office",                "cefr_level": "A2",
     "examples": [{"nl": "Hij werkt op kantoor van negen tot vijf.", "en": "He works at the office from nine to five."}],
     "use_cases": [{"nl": "Het kantoor is op de derde verdieping.", "en": "The office is on the third floor."}]},

    # ── B1 ────────────────────────────────────────────────────────────────────
    {"word": "onderzoek",    "translation": "research / investigation","cefr_level": "B1",
     "examples": [{"nl": "Ze doet onderzoek naar taalverwerving.", "en": "She is conducting research into language acquisition."}],
     "use_cases": [{"nl": "Academisch onderzoek vereist kritisch denken.", "en": "Academic research requires critical thinking."}]},

    {"word": "scriptie",     "translation": "thesis / dissertation",  "cefr_level": "B1",
     "examples": [{"nl": "Ik schrijf mijn scriptie over duurzaamheid.", "en": "I am writing my thesis on sustainability."}],
     "use_cases": [{"nl": "Een goede scriptie vereist veel voorbereiding.", "en": "A good thesis requires a lot of preparation."}]},

    {"word": "maatschappij", "translation": "society",               "cefr_level": "B1",
     "examples": [{"nl": "De maatschappij verandert snel.", "en": "Society changes rapidly."}],
     "use_cases": [{"nl": "Onderwijs speelt een grote rol in de maatschappij.", "en": "Education plays a major role in society."}]},

    {"word": "ervaring",     "translation": "experience",            "cefr_level": "B1",
     "examples": [{"nl": "Ze heeft veel ervaring met onderzoek doen.", "en": "She has a lot of experience with doing research."}],
     "use_cases": [{"nl": "Werkervaring is waardevol op de arbeidsmarkt.", "en": "Work experience is valuable in the labour market."}]},

    {"word": "conclusie",    "translation": "conclusion",            "cefr_level": "B1",
     "examples": [{"nl": "Wat is de conclusie van jouw onderzoek?", "en": "What is the conclusion of your research?"}],
     "use_cases": [{"nl": "Een goede conclusie vat de bevindingen samen.", "en": "A good conclusion summarises the findings."}]},

    {"word": "beargumenteren","translation": "to argue / substantiate","cefr_level": "B1",
     "examples": [{"nl": "Je moet je standpunt kunnen beargumenteren.", "en": "You must be able to substantiate your position."}],
     "use_cases": [{"nl": "In een debat leer je ideeën te beargumenteren.", "en": "In a debate you learn to argue ideas."}]},

    {"word": "samenvatting", "translation": "summary / abstract",    "cefr_level": "B1",
     "examples": [{"nl": "Schrijf een samenvatting van het artikel.", "en": "Write a summary of the article."}],
     "use_cases": [{"nl": "Een goede samenvatting bevat de kernpunten.", "en": "A good summary contains the key points."}]},

    {"word": "beoordelen",   "translation": "to assess / evaluate",  "cefr_level": "B1",
     "examples": [{"nl": "De docent beoordeelt het werkstuk.", "en": "The teacher evaluates the assignment."}],
     "use_cases": [{"nl": "Studenten worden beoordeeld op inhoud en stijl.", "en": "Students are assessed on content and style."}]},

    {"word": "tentamen",     "translation": "exam / test",           "cefr_level": "B1",
     "examples": [{"nl": "Het tentamen is volgende week.", "en": "The exam is next week."}],
     "use_cases": [{"nl": "Tijdens het tentamen mag je geen notities gebruiken.", "en": "During the exam you may not use notes."}]},

    {"word": "hoorcollege",  "translation": "lecture",               "cefr_level": "B1",
     "examples": [{"nl": "Het hoorcollege begint om negen uur.", "en": "The lecture starts at nine o'clock."}],
     "use_cases": [{"nl": "Na het hoorcollege kun je vragen stellen.", "en": "After the lecture you can ask questions."}]},
]

print("Seeding Lexicon...")
for entry in LEXICON_DATA:
    exists = db.query(Lexicon).filter(Lexicon.word == entry["word"]).first()
    if not exists:
        db.add(Lexicon(**entry))
db.commit()
print(f"  ✓ {len(LEXICON_DATA)} words processed")


# ─────────────────────────────────────────────────────────────────────────────
#  3. Three Classroom Users
# ─────────────────────────────────────────────────────────────────────────────
USERS = [
    {
        "user_id": "u_A1",
        "display_name": "Sophie",
        "age": 19,
        "location": "Amsterdam",
        "education_level": "Secondary School",
        "learning_purpose": "Social",
        "native_language": "German",
        "estimated_cefr": "A1",
        "topics": [
            ("boodschappen doen", TopicStatus.INTERESTED),
            ("familie en vrienden", TopicStatus.INTERESTED),
            ("dagelijkse routines", TopicStatus.INTERESTED),
            ("sport", TopicStatus.NEUTRAL),
            ("politiek", TopicStatus.HATED),
        ],
        "learning_words": ["hallo", "brood", "water", "huis", "fiets"],
    },
    {
        "user_id": "u_A2",
        "display_name": "Lars",
        "age": 28,
        "location": "Rotterdam",
        "education_level": "Bachelor",
        "learning_purpose": "Work",
        "native_language": "English",
        "estimated_cefr": "A2",
        "topics": [
            ("kantoor en werk", TopicStatus.INTERESTED),
            ("treinen en reizen", TopicStatus.INTERESTED),
            ("weer en natuur", TopicStatus.INTERESTED),
            ("koken", TopicStatus.NEUTRAL),
            ("celebrity nieuws", TopicStatus.HATED),
        ],
        "learning_words": ["vergadering", "vertraging", "collega", "afspraak"],
    },
    {
        "user_id": "u_014",   # keep original demo user, rename to Rowaid
        "display_name": "Rowaid",
        "age": 22,
        "location": "Maastricht",
        "education_level": "University",
        "learning_purpose": "Academic",
        "native_language": "English",
        "estimated_cefr": "B1",
        "topics": [
            ("academisch schrijven", TopicStatus.INTERESTED),
            ("stadsvervoer Maastricht", TopicStatus.INTERESTED),
            ("Nederlandse cultuur", TopicStatus.INTERESTED),
            ("sport", TopicStatus.NEUTRAL),
            ("koken", TopicStatus.NEUTRAL),
            ("politiek", TopicStatus.HATED),
            ("celebrity nieuws", TopicStatus.HATED),
        ],
        "learning_words": ["scriptie", "maatschappij", "ervaring", "conclusie"],
    },
]

for u in USERS:
    name = u["display_name"]
    uid  = u["user_id"]
    print(f"Seeding user {name} ({uid})...")

    user = db.query(User).filter(User.user_id == uid).first()
    if not user:
        user = User(
            user_id=uid,
            age=u["age"],
            location=u["location"],
            education_level=u["education_level"],
            learning_purpose=u["learning_purpose"],
            native_language=u["native_language"],
            estimated_cefr=u["estimated_cefr"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"  ✓ User {name} created")
    else:
        print(f"  ✓ User {name} already exists")

    # Topics
    for topic_name, status in u["topics"]:
        exists = (
            db.query(UserTopic)
            .filter(UserTopic.user_id == uid, UserTopic.topic_name == topic_name)
            .first()
        )
        if not exists:
            db.add(UserTopic(user_id=uid, topic_name=topic_name, status=status))
    db.commit()
    print(f"  ✓ {len(u['topics'])} topics seeded")

    # Yellow words (LEARNING)
    for word_str in u["learning_words"]:
        lex = db.query(Lexicon).filter(Lexicon.word == word_str).first()
        if not lex:
            print(f"  ⚠ Word '{word_str}' not in lexicon — skipping")
            continue
        exists = (
            db.query(UserVocabularyVector)
            .filter(
                UserVocabularyVector.user_id == uid,
                UserVocabularyVector.word_id == lex.word_id,
            )
            .first()
        )
        if not exists:
            db.add(UserVocabularyVector(
                user_id=uid,
                word_id=lex.word_id,
                status=VocabStatus.LEARNING,
                mastery_score=0.2,
                exposure_count=3,
            ))
    db.commit()
    print(f"  ✓ {len(u['learning_words'])} yellow words seeded")

db.close()
print("\n✅ Seed complete! Users: Sophie (A1), Lars (A2), Rowaid (B1)")
print("   Next: python3.11 run_engine.py")
