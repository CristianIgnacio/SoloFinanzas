import os
import unittest
from unittest.mock import patch

from app.core.config import Settings, validate_runtime_config


class RuntimeConfigTests(unittest.TestCase):
    def test_settings_read_process_environment(self):
        values = {
            "APP_ENV": "production",
            "DATABASE_URL": "postgresql://finance_api.example:password@pooler.example:5432/postgres?sslmode=require",
            "SUPABASE_URL": "https://example.supabase.co",
            "FRONTEND_ORIGINS": '["https://solofinanzas.vercel.app"]',
            "SUPABASE_SECRET_KEY": "test-only-secret",
            "TRUST_PROXY_HEADERS": "true",
        }
        with patch.dict(os.environ, values, clear=True):
            config = Settings(_env_file=None)

        self.assertEqual(config.app_env, "production")
        self.assertEqual(config.frontend_origins, ["https://solofinanzas.vercel.app"])
        self.assertEqual(config.supabase_url, "https://example.supabase.co")
        self.assertEqual(config.supabase_secret_key, "test-only-secret")
        self.assertTrue(config.trust_proxy_headers)
        validate_runtime_config(config, on_render=True)

    def test_render_rejects_local_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            config = Settings(_env_file=None)
        with self.assertRaisesRegex(RuntimeError, "APP_ENV=production"):
            validate_runtime_config(config, on_render=True)

    def test_production_rejects_missing_supabase_url(self):
        with patch.dict(os.environ, {"APP_ENV": "production", "DATABASE_URL": "postgresql://example"}, clear=True):
            config = Settings(_env_file=None)
        with self.assertRaisesRegex(RuntimeError, "Supabase HTTPS"):
            validate_runtime_config(config, on_render=True)
