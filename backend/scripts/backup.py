"""Encrypted finance-schema backups. Needs PostgreSQL client tools in PATH."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit, unquote

from cryptography.fernet import Fernet
import psycopg


def pg_environment():
    url = urlsplit(os.environ['BACKUP_DATABASE_URL'].replace('postgresql+psycopg://', 'postgresql://'))
    if url.scheme not in ('postgres', 'postgresql') or not url.hostname or not url.password:
        raise ValueError('Invalid PostgreSQL connection.')
    return {**os.environ, 'PGHOST': url.hostname, 'PGPORT': str(url.port or 5432),
        'PGUSER': unquote(url.username or ''), 'PGPASSWORD': unquote(url.password),
        'PGDATABASE': unquote(url.path.lstrip('/')), 'PGSSLMODE': os.getenv('BACKUP_SSLMODE', 'require')}


def seal(dump: bytes, key: str):
    manifest = json.dumps({'version': 1, 'sha256': hashlib.sha256(dump).hexdigest()}).encode()
    return Fernet(key.encode()).encrypt(manifest + b'\n' + dump)


def unseal(archive: bytes, key: str):
    manifest, dump = Fernet(key.encode()).decrypt(archive).split(b'\n', 1)
    metadata = json.loads(manifest)
    if metadata['version'] != 1 or metadata['sha256'] != hashlib.sha256(dump).hexdigest():
        raise ValueError('Invalid backup checksum.')
    return dump


def backup(directory: Path):
    directory = directory.resolve()
    repo = Path(__file__).resolve().parents[2]
    if directory == repo or repo in directory.parents:
        raise ValueError('Guarda los respaldos fuera del repositorio.')
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / ('solofinanzas-' + datetime.now(timezone.utc).strftime('%Y%m%d') + '.enc')
    key = os.environ['BACKUP_KEY']
    if destination.exists():
        unseal(destination.read_bytes(), key)
        return 'El respaldo de hoy ya existe y fue verificado.'
    dump = subprocess.run(['pg_dump', '--format=custom', '--schema=finance', '--no-owner', '--no-acl'],
        env=pg_environment(), capture_output=True, check=True, timeout=900).stdout
    archive = seal(dump, key)
    if unseal(archive, key) != dump: raise ValueError('Falló la verificación del cifrado.')
    # Exclusive creation avoids overwriting any existing archive.
    with destination.open('xb') as output: output.write(archive)
    copies = sorted(directory.glob('solofinanzas-????????.enc'), reverse=True)
    for old in copies[7:]:
        if old.is_file() and not old.is_symlink() and old.resolve().parent == directory:
            old.unlink()
    return 'Respaldo cifrado y verificado; retención de siete copias.'


def restore(source: Path):
    dump = unseal(source.read_bytes(), os.environ['BACKUP_KEY'])
    env = pg_environment()
    with psycopg.connect(host=env['PGHOST'], port=env['PGPORT'], user=env['PGUSER'],
        password=env['PGPASSWORD'], dbname=env['PGDATABASE'], sslmode=env['PGSSLMODE']) as connection:
        exists = connection.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema'))").fetchone()[0]
        if exists: raise ValueError('La restauración solo admite una base de ensayo vacía.')
    subprocess.run(['pg_restore', '--dbname', env['PGDATABASE'], '--single-transaction', '--exit-on-error', '--no-owner', '--no-acl'],
        env=env, input=dump, capture_output=True, check=True, timeout=900)
    return 'Restauración terminada. Revisa cantidades y totales antes de usar este destino.'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--directory', type=Path)
    group.add_argument('--restore', type=Path)
    args = parser.parse_args()
    try:
        print(restore(args.restore) if args.restore else backup(args.directory))
    except Exception:
        # Driver/subprocess errors may contain credentials or database contents.
        print('Falló el respaldo/restauración. Comprueba herramientas PostgreSQL, conexión, clave y destino vacío.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__': sys.exit(main())
