import asyncio
from datetime import date
from io import BytesIO
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from pypdf import PdfWriter
import jwt
from starlette.datastructures import UploadFile

from app.core.auth import decode_token
from app.core.config import settings
from app.core.body_limit import BodyLimitMiddleware
from app.api.routes.statements import _read_pdf
from app.services import pdf_worker
from app.services.pdf_importer import inspect_pdf, PdfImportError
from app.domain.enums import InstitutionCode
from scripts.backup import seal, unseal


class TokenTests(unittest.TestCase):
    def test_signed_token_and_invalid_claims(self):
        key = ec.generate_private_key(ec.SECP256R1())
        claims = dict(sub=str(UUID(int=1)), aud='authenticated', iss='https://example.supabase.co/auth/v1', iat=int(time.time()), exp=int(time.time()) + 300)
        client = SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key()))
        with patch('app.core.auth.jwks_client', return_value=client), patch.object(settings, 'supabase_url', 'https://example.supabase.co'):
            self.assertEqual(decode_token(jwt.encode(claims, key, algorithm='ES256'))['sub'], claims['sub'])
            for replacement in ({'aud': 'other'}, {'iss': 'https://attacker.test'}, {'exp': 1}, {'iat': int(time.time()) + 300}):
                with self.assertRaises(jwt.PyJWTError):
                    decode_token(jwt.encode({**claims, **replacement}, key, algorithm='ES256'))
            forged = ec.generate_private_key(ec.SECP256R1())
            with self.assertRaises(jwt.InvalidSignatureError):
                decode_token(jwt.encode(claims, forged, algorithm='ES256'))
            with self.assertRaises(jwt.InvalidAlgorithmError):
                decode_token(jwt.encode(claims, 'x' * 64, algorithm='HS256'))


class PdfLimitsTests(unittest.IsolatedAsyncioTestCase):
    async def test_oversize_file_is_closed(self):
        upload = UploadFile(filename='demo.pdf', file=BytesIO(b'x' * (10 * 1024 * 1024 + 1)))
        with self.assertRaises(HTTPException) as caught: await _read_pdf(upload)
        self.assertEqual(caught.exception.status_code, 413)
        self.assertTrue(upload.file.closed)

    async def test_chunked_body_limit_precedes_application(self):
        called, sent = [], []
        async def app(*_): called.append(True)
        chunks = iter([{'type': 'http.request', 'body': b'1234', 'more_body': True}, {'type': 'http.request', 'body': b'56'}])
        async def receive(): return next(chunks)
        async def send(message): sent.append(message)
        await BodyLimitMiddleware(app, maximum=5)({'type': 'http'}, receive, send)
        self.assertFalse(called)
        self.assertEqual(sent[0]['status'], 413)

    async def test_concurrent_parser_is_rejected(self):
        with patch.object(pdf_worker, '_slot', asyncio.Lock()):
            await pdf_worker._slot.acquire()
            try:
                with self.assertRaises(HTTPException) as caught: await pdf_worker.inspect_pdf_isolated()
                self.assertEqual(caught.exception.status_code, 429)
            finally: pdf_worker._slot.release()

    async def test_invalid_pdf_runs_in_disposable_process(self):
        with patch.object(pdf_worker, '_slot', asyncio.Lock()):
            with self.assertRaises(HTTPException) as caught:
                await pdf_worker.inspect_pdf_isolated(file_name='demo.pdf', file_bytes=b'%PDF-invalid', institution=InstitutionCode.BANCO_DE_CHILE, password=None)
            self.assertEqual(caught.exception.status_code, 422)
            self.assertFalse(pdf_worker._slot.locked())

    async def test_page_limit(self):
        writer = PdfWriter()
        for _ in range(51): writer.add_blank_page(width=100, height=100)
        stream = BytesIO(); writer.write(stream)
        with self.assertRaises(PdfImportError):
            inspect_pdf(file_name='demo.pdf', file_bytes=stream.getvalue(), institution=InstitutionCode.BANCO_DE_CHILE)

    async def test_timeout_reaps_child(self):
        with patch.object(settings, 'pdf_timeout_seconds', 0), patch.object(pdf_worker, '_slot', asyncio.Lock()):
            with self.assertRaises(HTTPException) as caught:
                await pdf_worker.inspect_pdf_isolated(file_name='demo.pdf', file_bytes=b'%PDF-invalid', institution=InstitutionCode.BANCO_DE_CHILE)
            self.assertIn('tiempo', caught.exception.detail)


class BackupCryptoTests(unittest.TestCase):
    def test_round_trip_wrong_key_and_tampering(self):
        key = Fernet.generate_key().decode()
        dump = b'PGDMP synthetic test data'
        archive = seal(dump, key)
        self.assertNotIn(dump, archive)
        self.assertEqual(unseal(archive, key), dump)
        with self.assertRaises(InvalidToken): unseal(archive, Fernet.generate_key().decode())
        with self.assertRaises(InvalidToken): unseal(archive[:-5] + b'12345', key)
