-- Run as the migration administrator AFTER alembic upgrade head.
-- Set the password separately using scripts/set_runtime_password.py or psql \password finance_api.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_api') THEN
    CREATE ROLE finance_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
REVOKE ALL ON SCHEMA finance FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA finance FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA finance FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA finance FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA finance FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA finance FROM authenticated;
  END IF;
END $$;
GRANT USAGE ON SCHEMA finance TO finance_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO finance_api;
REVOKE ALL ON finance.alembic_version FROM finance_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finance TO finance_api;
ALTER ROLE finance_api SET search_path = finance, public;
