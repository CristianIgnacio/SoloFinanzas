from __future__ import annotations

import argparse
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import DB_PATH, engine
from app.domain.enums import CategorySource
from app.models.transaction import TransactionModel
from app.models.categorization_rule import CategorizationRuleModel
from app.services.categorization_rules import _normalize_keyword
from app.services.statements import _categorize


def _backup_database() -> Path:
    backup_path = DB_PATH.with_suffix(
        f".backup-recategorize-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    )
    shutil.copy2(DB_PATH, backup_path)
    return backup_path


def _source_value(source: CategorySource | str | None) -> str | None:
    if source is None:
        return None
    if isinstance(source, CategorySource):
        return source.value
    return str(source)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reaplica reglas de categorizacion sobre transacciones existentes."
    )
    parser.add_argument(
        "--include-manual",
        action="store_true",
        help="Tambien sobrescribe categorias asignadas manualmente.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra el impacto sin guardar cambios ni crear backup.",
    )
    parser.add_argument(
        "--categorized-only",
        action="store_true",
        help="Revisa solo movimientos que actualmente tienen una categoria.",
    )
    args = parser.parse_args()

    backup_path = None if args.dry_run else _backup_database()
    now = datetime.now(timezone.utc)
    counters: Counter[str] = Counter()

    with Session(engine) as session:
        rules = session.exec(select(CategorizationRuleModel)).all()
        for rule in rules:
            normalized_keyword = _normalize_keyword(rule.keyword)
            if normalized_keyword == rule.keyword:
                continue
            counters["normalized_rules"] += 1
            if not args.dry_run:
                rule.keyword = normalized_keyword
                session.add(rule)

        transactions = session.exec(
            select(TransactionModel).order_by(TransactionModel.id.asc())
        ).all()

        for transaction in transactions:
            counters["total"] += 1
            if (
                not args.include_manual
                and _source_value(transaction.category_source) == CategorySource.MANUAL.value
            ):
                counters["manual_skipped"] += 1
                if transaction.rule_id_applied is not None:
                    counters["manual_rule_refs_cleared"] += 1
                    if not args.dry_run:
                        transaction.rule_id_applied = None
                        transaction.updated_at = now
                        session.add(transaction)
                continue
            if args.categorized_only and transaction.category_id is None:
                counters["uncategorized_skipped"] += 1
                continue

            category_id, category_source, rule_id = _categorize(
                session,
                transaction.normalized_description,
                _source_value(transaction.transaction_type) or "",
            )

            before = (
                transaction.category_id,
                _source_value(transaction.category_source),
                transaction.rule_id_applied,
            )
            after = (
                category_id,
                _source_value(category_source),
                rule_id,
            )

            if after == before:
                counters["unchanged"] += 1
                continue

            counters["changed"] += 1
            if category_id is None:
                counters["became_uncategorized"] += 1
            elif category_source == CategorySource.RULE:
                counters["matched_rule"] += 1

            if args.dry_run:
                continue

            transaction.category_id = category_id
            transaction.category_source = category_source
            transaction.rule_id_applied = rule_id
            transaction.updated_at = now
            session.add(transaction)

        if not args.dry_run:
            session.commit()

    if backup_path is not None:
        print(f"Backup: {backup_path}")
    print(f"Transacciones revisadas: {counters['total']}")
    print(f"Manual preservadas: {counters['manual_skipped']}")
    print(
        "Referencias obsoletas en manuales limpiadas: "
        f"{counters['manual_rule_refs_cleared']}"
    )
    print(f"Sin categoria omitidas: {counters['uncategorized_skipped']}")
    print(f"Reglas normalizadas: {counters['normalized_rules']}")
    print(f"Sin cambios: {counters['unchanged']}")
    print(f"Actualizadas: {counters['changed']}")
    print(f"Asignadas por regla: {counters['matched_rule']}")
    print(f"Quedaron Sin categoria: {counters['became_uncategorized']}")


if __name__ == "__main__":
    main()
