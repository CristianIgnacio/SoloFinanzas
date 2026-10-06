from alembic import context
from sqlalchemy import text
from sqlmodel import SQLModel

from app.core.database import engine
import app.models  # register all tables

def run_migrations():
    with engine.connect() as connection:
        postgres = connection.dialect.name == "postgresql"
        if postgres:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS finance"))
            connection.commit()
        context.configure(connection=connection, target_metadata=SQLModel.metadata,
                          compare_type=True, version_table_schema="finance" if postgres else None)
        with context.begin_transaction():
            context.run_migrations()

run_migrations()
