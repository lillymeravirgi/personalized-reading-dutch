from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

try:
    from lexicon_data import LEXICON_DATA
except Exception:
    LEXICON_DATA = []


LEVELS = ["A1", "A2", "B1", "B2", "C1"]
DEFAULT_SOURCE = Path("/Users/jy/Downloads/NT2Lex-CGN-v01.tsv")
DEFAULT_OUTPUT = Path("/private/tmp/leeswijs_vocab/nt2lex_candidates.csv")

FUNCTION_WORDS = {
    "de", "het", "een", "en", "maar", "of", "want", "dus", "omdat",
    "ik", "jij", "je", "hij", "zij", "ze", "wij", "we", "u", "jullie",
    "mij", "me", "jou", "hem", "haar", "ons", "hun", "hen",
    "dit", "dat", "deze", "die", "wie", "wat", "waar", "wanneer",
    "in", "op", "aan", "van", "voor", "met", "naar", "uit", "bij",
    "door", "over", "onder", "boven", "tussen", "achter", "naast",
    "niet", "geen", "wel", "al", "nog", "ook", "er", "hier", "daar",
    "is", "zijn", "was", "waren", "ben", "bent", "worden", "hebben",
    "heb", "hebt", "heeft", "had", "hadden",
}


def parse_number(value: str | None) -> float | None:
    if value in (None, "", "-"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def target_pos(tag: str) -> bool:
    parts = tag.split()
    return any(part.startswith(("N(", "WW(", "ADJ(")) for part in parts)


def eligible_reason(word: str, tag: str) -> tuple[bool, str]:
    raw = word.strip()
    clean = raw.lower()
    if not clean:
        return False, "empty"
    if raw != raw.lower():
        return False, "capitalized_or_name"
    if clean in FUNCTION_WORDS:
        return False, "function_word"
    if clean.startswith("'"):
        return False, "contracted_phrase"
    if any(char.isdigit() for char in clean):
        return False, "contains_digit"
    if len(clean) < 3:
        return False, "too_short"
    if len(clean) > 36:
        return False, "too_long"
    if not target_pos(tag):
        return False, "non_target_pos"
    return True, "eligible"


def derive_level(row: dict[str, str]) -> tuple[str | None, float, int, str]:
    observed: list[str] = []
    for level in LEVELS:
        freq = parse_number(row.get(f"F@{level}"))
        if freq is not None and freq > 0:
            observed.append(level)

    if not observed:
        return None, 0.0, 0, ""

    level = observed[0]
    sfi = parse_number(row.get(f"SFI@{level}")) or 0.0
    freq = int(parse_number(row.get(f"F@{level}")) or 0)
    return level, sfi, freq, ",".join(observed)


def prepare(source: Path, output: Path, max_per_level: int, include_ineligible: bool) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    existing_translations = {
        entry["word"].strip().lower(): entry.get("translation", "")
        for entry in LEXICON_DATA
    }

    by_word: dict[str, dict[str, str | int | float | bool]] = {}
    raw_count = 0
    with source.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            raw_count += 1
            level, sfi, freq, observed = derive_level(row)
            if level is None:
                continue

            raw_word = row["word"].strip()
            word = raw_word.lower()
            eligible, reason = eligible_reason(raw_word, row["tag"])
            if not include_ineligible and not eligible:
                continue

            candidate = {
                "word": word,
                "nt2lex_tag": row["tag"],
                "derived_cefr_level": level,
                "source_sfi": round(sfi, 4),
                "source_frequency": freq,
                "levels_observed": observed,
                "eligible_for_target": eligible,
                "eligibility_reason": reason,
                "already_in_seed": word in existing_translations,
                "existing_translation": existing_translations.get(word, ""),
            }

            existing = by_word.get(word)
            if existing is None or float(candidate["source_sfi"]) > float(existing["source_sfi"]):
                by_word[word] = candidate

    rows = list(by_word.values())
    rows.sort(key=lambda r: (str(r["derived_cefr_level"]), -float(r["source_sfi"]), str(r["word"])))

    if max_per_level > 0:
        kept: list[dict[str, str | int | float | bool]] = []
        counts: Counter[str] = Counter()
        for row in rows:
            level = str(row["derived_cefr_level"])
            if counts[level] >= max_per_level:
                continue
            kept.append(row)
            counts[level] += 1
        rows = kept

    fields = [
        "word",
        "nt2lex_tag",
        "derived_cefr_level",
        "source_sfi",
        "source_frequency",
        "levels_observed",
        "eligible_for_target",
        "eligibility_reason",
        "already_in_seed",
        "existing_translation",
    ]
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    level_counts = Counter(str(row["derived_cefr_level"]) for row in rows)
    seed_matches = sum(1 for row in rows if row["already_in_seed"])
    print(f"source_rows={raw_count}")
    print(f"candidate_rows={len(rows)}")
    print(f"already_in_seed={seed_matches}")
    for level in LEVELS:
        print(f"{level}={level_counts[level]}")
    print(f"output={output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare NT2Lex target-word candidates for LeesWijs.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-per-level", type=int, default=300)
    parser.add_argument("--include-ineligible", action="store_true")
    args = parser.parse_args()

    prepare(
        source=args.source,
        output=args.output,
        max_per_level=args.max_per_level,
        include_ineligible=args.include_ineligible,
    )


if __name__ == "__main__":
    main()
