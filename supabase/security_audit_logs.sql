-- =========================================================================
-- JEXA AI - Durable Security Audit Logs Table (Backend Service Role Only)
-- =========================================================================
-- Execute this SQL in your Supabase SQL Editor when enabling durable audit
-- persistence via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
--
-- Security design:
--   * Row Level Security (RLS) is strictly enabled.
--   * Zero policies are granted to `anon` or `authenticated` roles.
--   * Only the backend server using SUPABASE_SERVICE_ROLE_KEY can insert
--     and query audit events. Never expose SUPABASE_SERVICE_ROLE_KEY to clients.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.jexa_security_audit_logs (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp_ms BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  actor_user_id TEXT NULL,
  actor_email TEXT NULL,
  actor_role TEXT NULL,
  ip TEXT NULL,
  method TEXT NULL,
  path TEXT NULL,
  status_code INTEGER NULL,
  summary TEXT NOT NULL,
  details JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_jexa_security_audit_logs_timestamp_ms
  ON public.jexa_security_audit_logs (timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_jexa_security_audit_logs_event_type_ts
  ON public.jexa_security_audit_logs (event_type, timestamp_ms DESC);

ALTER TABLE public.jexa_security_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.jexa_security_audit_logs FROM anon, authenticated;
