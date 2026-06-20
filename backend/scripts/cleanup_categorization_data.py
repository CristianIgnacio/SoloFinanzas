from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BACKEND_DIR / "data" / "solo_finanzas.db"


def _category_id(cursor: sqlite3.Cursor, name: str) -> int | None:
    row = cursor.execute(
        "SELECT id FROM categories WHERE name = ? ORDER BY id LIMIT 1",
        (name,),
    ).fetchone()
    return int(row[0]) if row else None


def _rule_ids(cursor: sqlite3.Cursor, where_sql: str, params: tuple[object, ...] = ()) -> set[int]:
    return {
        int(row[0])
        for row in cursor.execute(
            f"""
            SELECT r.id
            FROM categorization_rules r
            LEFT JOIN categories c ON c.id = r.category_id
            WHERE {where_sql}
            """,
            params,
        )
    }


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"No existe la base local: {DB_PATH}")

    backup_path = DB_PATH.with_suffix(
        f".backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    )
    shutil.copy2(DB_PATH, backup_path)

    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.cursor()

        bad_rule_ids: set[int] = set()
        bad_rule_ids |= _rule_ids(cursor, "r.keyword IS NULL OR length(trim(r.keyword)) = 0")
        bad_rule_ids |= _rule_ids(cursor, "c.name IS NULL OR length(trim(c.name)) = 0")
        bad_rule_ids |= _rule_ids(
            cursor,
            """
            (r.keyword = 'uber eats' AND c.name = 'Transporte')
            OR (r.keyword = 'deposito' AND c.name = 'Transporte')
            OR (r.keyword IN ('cine', 'cinepla', 'cineplan', 'cineplanet')
                AND c.name = 'Cuentas y servicios')
            OR (r.keyword = 'ganancia copec pay' AND c.name = 'Ingresos')
            """,
        )

        blank_category_ids = {
            int(row[0])
            for row in cursor.execute(
                "SELECT id FROM categories WHERE name IS NULL OR length(trim(name)) = 0"
            )
        }

        reset_params: list[object] = []
        reset_clauses = ["category_source = 'default'"]
        if bad_rule_ids:
            placeholders = ",".join("?" for _ in bad_rule_ids)
            reset_clauses.append(f"rule_id_applied IN ({placeholders})")
            reset_params.extend(sorted(bad_rule_ids))
        if blank_category_ids:
            placeholders = ",".join("?" for _ in blank_category_ids)
            reset_clauses.append(f"category_id IN ({placeholders})")
            reset_params.extend(sorted(blank_category_ids))

        reset_count = cursor.execute(
            f"""
            UPDATE transactions
            SET category_id = NULL,
                category_source = NULL,
                rule_id_applied = NULL
            WHERE {" OR ".join(reset_clauses)}
            """,
            tuple(reset_params),
        ).rowcount

        deleted_rules = 0
        if bad_rule_ids:
            placeholders = ",".join("?" for _ in bad_rule_ids)
            deleted_rules = cursor.execute(
                f"DELETE FROM categorization_rules WHERE id IN ({placeholders})",
                tuple(sorted(bad_rule_ids)),
            ).rowcount

        deleted_categories = 0
        if blank_category_ids:
            placeholders = ",".join("?" for _ in blank_category_ids)
            deleted_categories = cursor.execute(
                f"DELETE FROM categories WHERE id IN ({placeholders})",
                tuple(sorted(blank_category_ids)),
            ).rowcount

        gas_id = _category_id(cursor, "Gas")
        gasto_id = _category_id(cursor, "Gasto")
        fixed_categories = 0
        for category_id in [gas_id, gasto_id]:
            if category_id is None:
                continue
            fixed_categories += cursor.execute(
                "UPDATE categories SET type = 'expense' WHERE id = ? AND type != 'expense'",
                (category_id,),
            ).rowcount

        connection.commit()

    print(f"Backup: {backup_path}")
    print(f"Reglas eliminadas: {deleted_rules} ({sorted(bad_rule_ids)})")
    print(f"Categorias vacias eliminadas: {deleted_categories}")
    print(f"Categorias corregidas a expense: {fixed_categories}")
    print(f"Transacciones reseteadas a Sin categoria: {reset_count}")


if __name__ == "__main__":
    main()
