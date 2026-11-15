-- One-time setup: xcroncv's role and schema inside X Cron's `xcron` database.
-- Run as the xcron superuser. Dev-only password; change it outside local dev.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xcroncv') THEN
    CREATE ROLE xcroncv LOGIN PASSWORD 'xcroncv' CREATEDB;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS xcroncv AUTHORIZATION xcroncv;

-- Isolation: xcroncv cannot touch the xcron schema, and vice versa.
REVOKE ALL ON SCHEMA xcron FROM xcroncv;
REVOKE ALL ON SCHEMA public FROM xcroncv;
ALTER ROLE xcroncv SET search_path = xcroncv;
