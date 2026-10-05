from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path


CATEGORY_HIERARCHY_VERSION = 1


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row[1])
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _backup_database(connection: sqlite3.Connection, database_path: Path) -> Path:
    backup_path = database_path.with_suffix(
        f".backup-migration-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    )
    with closing(sqlite3.connect(backup_path)) as backup:
        connection.backup(backup)
    return backup_path


def _rebuild_legacy_categories(connection: sqlite3.Connection) -> None:
    columns = _columns(connection, "categories")
    if {"parent_id", "is_active", "sort_order"}.issubset(columns):
        return

    connection.execute(
        """
        CREATE TABLE categories_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
            is_default INTEGER NOT NULL DEFAULT 1 CHECK (is_default IN (0, 1)),
            parent_id INTEGER NULL REFERENCES categories_new(id),
            is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
            sort_order INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    connection.execute(
        """
        INSERT INTO categories_new (
            id, name, type, is_default, parent_id, is_active, sort_order
        )
        SELECT id, name, type, is_default, NULL, 1, 0
        FROM categories
        """
    )
    connection.execute("DROP TABLE categories")
    connection.execute("ALTER TABLE categories_new RENAME TO categories")


def _category_id(connection: sqlite3.Connection, name: str) -> int | None:
    row = connection.execute(
        "SELECT id FROM categories WHERE lower(trim(name)) = lower(trim(?)) ORDER BY id LIMIT 1",
        (name,),
    ).fetchone()
    return int(row[0]) if row else None


def _merge_legacy_gasto(connection: sqlite3.Connection) -> None:
    gasto_id = _category_id(connection, "Gasto")
    if gasto_id is None:
        return

    otros_id = _category_id(connection, "Otros")
    if otros_id is None:
        connection.execute(
            "UPDATE categories SET name = 'Otros', sort_order = 100 WHERE id = ?",
            (gasto_id,),
        )
        return

    connection.execute(
        "UPDATE transactions SET category_id = ? WHERE category_id = ?",
        (otros_id, gasto_id),
    )
    connection.execute(
        "UPDATE categorization_rules SET category_id = ? WHERE category_id = ?",
        (otros_id, gasto_id),
    )
    connection.execute("DELETE FROM categories WHERE id = ?", (gasto_id,))


def _ensure_finance_root(connection: sqlite3.Connection) -> int | None:
    finance_id = _category_id(connection, "Finanzas")
    if finance_id is not None:
        return finance_id

    dependent_names = ("Deudas y creditos", "Comisiones bancarias")
    if not any(_category_id(connection, name) for name in dependent_names):
        return None

    cursor = connection.execute(
        """
        INSERT INTO categories (
            name, type, is_default, parent_id, is_active, sort_order
        ) VALUES ('Finanzas', 'expense', 1, NULL, 1, 50)
        """
    )
    return int(cursor.lastrowid)


def _apply_initial_hierarchy(connection: sqlite3.Connection) -> None:
    _merge_legacy_gasto(connection)
    finance_id = _ensure_finance_root(connection)
    relationships = {
        "Ingresos": [
            ("Sueldo", 10),
            ("Inversiones", 20),
            ("Premios de apuestas", 30),
            ("Ahorros", 40),
        ],
        "Comida": [("Supermercado", 10)],
        "Transporte": [("Estacionamiento", 10)],
        "Cuentas y servicios": [("Suscripciones", 10)],
        "Finanzas": [
            ("Deudas y creditos", 10),
            ("Comisiones bancarias", 20),
        ],
        "Entretenimiento": [("Apuestas deportivas", 10)],
    }

    root_order = {
        "Ingresos": 10,
        "Comida": 20,
        "Transporte": 30,
        "Cuentas y servicios": 40,
        "Finanzas": 50,
        "Entretenimiento": 60,
        "Compras": 70,
        "Salud": 80,
        "Educacion": 90,
        "Otros": 100,
        "Transferencias": 110,
    }
    for root_name, sort_order in root_order.items():
        root_id = finance_id if root_name == "Finanzas" else _category_id(connection, root_name)
        if root_id is not None:
            connection.execute(
                "UPDATE categories SET parent_id = NULL, sort_order = ? WHERE id = ?",
                (sort_order, root_id),
            )

    for parent_name, children in relationships.items():
        parent_id = _category_id(connection, parent_name)
        if parent_id is None:
            continue
        for child_name, sort_order in children:
            child_id = _category_id(connection, child_name)
            if child_id is not None and child_id != parent_id:
                connection.execute(
                    "UPDATE categories SET parent_id = ?, sort_order = ? WHERE id = ?",
                    (parent_id, sort_order, child_id),
                )


def _create_category_indexes(connection: sqlite3.Connection) -> None:
    connection.execute("CREATE INDEX IF NOT EXISTS ix_categories_name ON categories(name)")
    connection.execute(
        "CREATE INDEX IF NOT EXISTS ix_categories_parent_id ON categories(parent_id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS ix_categories_is_active ON categories(is_active)"
    )
    connection.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_parent_normalized_name
        ON categories(COALESCE(parent_id, -1), lower(trim(name)))
        """
    )


def apply_database_migrations(database_path: Path) -> Path | None:
    """Aplica migraciones SQLite pendientes y crea un respaldo antes de mutar."""
    if not database_path.exists():
        return None

    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
        applied = {
            int(row[0])
            for row in connection.execute("SELECT version FROM schema_migrations")
        }
        if CATEGORY_HIERARCHY_VERSION in applied:
            return None

        connection.commit()
        backup_path = _backup_database(connection, database_path)
        connection.execute("PRAGMA foreign_keys=OFF")
        try:
            connection.execute("BEGIN IMMEDIATE")
            _rebuild_legacy_categories(connection)
            _apply_initial_hierarchy(connection)
            _create_category_indexes(connection)
            connection.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                (CATEGORY_HIERARCHY_VERSION, datetime.now().isoformat()),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys=ON")

        violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(
                f"La migracion dejo claves foraneas invalidas: {violations[:5]}"
            )
        return backup_path
