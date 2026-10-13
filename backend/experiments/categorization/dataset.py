from __future__ import annotations

import csv
import json
import random
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from uuid import uuid4


REDACTIONS = (
    (re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"), "[EMAIL]"),
    (re.compile(r"\b(?:https?://|www\.)\S+", re.I), "[URL]"),
    (re.compile(r"\b(?:\d{1,2}\.){2}\d{3}-[\dkK]\b|\b\d{7,8}-[\dkK]\b"), "[RUT]"),
    (re.compile(r"\b(?:\d[ -]?){8,}\b"), "[NUMERO]"),
    (re.compile(r"\b\d{4,}\b"), "[NUMERO]"),
)


def redact(text: str) -> str:
    """Depuración automática inicial; la aprobación externa exige revisión humana."""
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return " ".join(text.split())


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("x", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def prepare(db_path: Path, out_dir: Path, size: int = 120, seed: int = 42) -> dict:
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    if out_dir.exists() and any(out_dir.iterdir()):
        raise FileExistsError(f"La salida no está vacía: {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    # URI read-only: no usa el engine de FastAPI ni puede modificar la base.
    db = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        owners = db.execute(
            "SELECT user_id, COUNT(*) AS n FROM transactions GROUP BY user_id ORDER BY n DESC"
        ).fetchall()
        if not owners:
            raise ValueError("La base no contiene movimientos")
        owner = owners[0]["user_id"]
        cats = [dict(row) for row in db.execute(
            "SELECT id, name, type, parent_id, is_active FROM categories WHERE user_id = ?",
            (owner,),
        )]
        by_id = {row["id"]: row for row in cats}
        for cat in cats:
            parent = by_id.get(cat["parent_id"])
            cat["path"] = f"{parent['name']} > {cat['name']}" if parent else cat["name"]
        rows = [dict(row) for row in db.execute(
            """SELECT id, date, description, normalized_description, amount_clp,
                      transaction_type, category_id, category_source
               FROM transactions
               WHERE user_id = ? AND category_id IS NOT NULL
               ORDER BY date, id""",
            (owner,),
        ) if row["category_id"] in by_id and by_id[row["category_id"]]["is_active"]]
        rules = [dict(row) for row in db.execute(
            """SELECT id, keyword, category_id, priority FROM categorization_rules
               WHERE user_id = ? ORDER BY priority DESC, LENGTH(keyword) DESC, id""",
            (owner,),
        )]
    finally:
        db.close()

    rng = random.Random(seed)
    rng.shuffle(rows)
    selected = rows[: min(round(size * 0.7), len(rows))]
    remaining = rows[len(selected):]
    groups: dict[int, list[dict]] = defaultdict(list)
    for row in remaining:
        groups[row["category_id"]].append(row)
    # El resto da presencia a clases minoritarias sin perder la muestra natural.
    while len(selected) < min(size, len(rows)) and groups:
        for category_id in sorted(groups, key=lambda key: (len(groups[key]), key)):
            if len(selected) >= min(size, len(rows)):
                break
            selected.append(groups[category_id].pop())
        groups = {key: value for key, value in groups.items() if value}

    cases, reviews, baseline = [], [], []
    for row in selected:
        case_id = uuid4().hex
        description = redact(row["description"])
        normalized = redact(row["normalized_description"])
        cases.append({
            "case_id": case_id,
            "description": description,
            "normalized_description": normalized,
            "amount_clp": abs(row["amount_clp"]),
            "transaction_type": row["transaction_type"],
        })
        reviews.append({
            "case_id": case_id,
            "transaction_id_local": row["id"],
            "date_local": row["date"],
            "description_original_local": row["description"],
            "description_depurada_a_enviar": description,
            "historical_category_id": row["category_id"],
            "historical_category_path": by_id[row["category_id"]]["path"],
            "historical_source": row["category_source"],
            "gold_category_id": row["category_id"],
            "verified": "",
            "external_approved": "",
        })
        prediction = None
        for rule in rules:
            cat = by_id.get(rule["category_id"])
            if not cat or not cat["is_active"]:
                continue
            if cat["type"] not in (row["transaction_type"], "transfer"):
                continue
            keyword = " ".join(re.sub(r"[^\w\s]", " ", rule["keyword"].lower()).split())
            if keyword and f" {keyword} " in f" {row['normalized_description']} ":
                prediction = rule["category_id"]
                break
        baseline.append({"case_id": case_id, "category_id": prediction,
                         "top_probability": None, "latency_ms": 0, "error": None})

    write_jsonl(out_dir / "cases.jsonl", cases)
    write_jsonl(out_dir / "taxonomy.jsonl", [cat for cat in cats if cat["is_active"]])
    write_jsonl(out_dir / "predictions_rules_current.jsonl", baseline)
    with (out_dir / "taxonomy.csv").open("x", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "path", "type", "parent_id"])
        writer.writeheader()
        writer.writerows({key: cat[key] for key in writer.fieldnames}
                         for cat in cats if cat["is_active"])
    with (out_dir / "review.csv").open("x", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(reviews[0]))
        writer.writeheader()
        writer.writerows(reviews)
    return {"cases": len(cases), "categories": len(cats),
            "historical_labels_unverified": len(reviews), "selected_owner_transactions": owners[0]["n"]}


def review_rows(path: Path) -> dict[str, dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return {row["case_id"]: row for row in csv.DictReader(handle)}


def is_yes(value: str | None) -> bool:
    return (value or "").strip().lower() in {"si", "sí", "s", "yes", "y", "true", "1"}
