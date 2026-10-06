"""Set the finance_api password interactively without installing psql.

Uses libpq's password-change operation, which encrypts the password before
sending the ALTER ROLE statement. Never accepts the new password in arguments.
"""

from getpass import getpass
from pathlib import Path
import sys

import psycopg
from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import settings


def main() -> None:
    url = make_url(settings.database_url)
    if url.get_backend_name() != "postgresql" or not (url.username or "").startswith("postgres"):
        raise SystemExit("DATABASE_URL debe usar la conexión administrativa PostgreSQL de Supabase.")
    if not url.password:
        raise SystemExit("DATABASE_URL no tiene contraseña administrativa.")

    conninfo = url.set(drivername="postgresql").render_as_string(hide_password=False)
    try:
        with psycopg.connect(conninfo, autocommit=True) as connection:
            exists = connection.execute(
                "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s)",
                ("finance_api",),
            ).fetchone()[0]
            if not exists:
                raise SystemExit("El rol finance_api no existe. Ejecuta primero scripts/runtime-role.sql.")
            if not hasattr(connection.pgconn, "change_password"):
                raise SystemExit("Actualiza dependencias con pip install -r requirements.txt y vuelve a intentar.")

            password = getpass("Nueva contraseña para finance_api (mínimo 16 caracteres): ")
            if len(password) < 16:
                raise SystemExit("La contraseña debe tener al menos 16 caracteres.")
            if getpass("Repite la contraseña: ") != password:
                raise SystemExit("Las contraseñas no coinciden; no se hizo ningún cambio.")

            connection.pgconn.change_password(b"finance_api", password.encode(connection.info.encoding))
    except psycopg.Error as exc:
        raise SystemExit(
            f"No se pudo actualizar el rol ({type(exc).__name__}). Verifica DATABASE_URL y los permisos."
        ) from None
    print("Contraseña de finance_api actualizada. Guárdala en tu gestor de contraseñas.")


if __name__ == "__main__":
    main()
