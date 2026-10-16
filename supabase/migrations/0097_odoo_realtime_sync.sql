-- ============================================================================
-- supabase/migrations/0097_odoo_realtime_sync.sql
--
-- Real-time bidirectional sync between AniXOS and Odoo.
--
-- Layers:
--   1. AniXOS → Odoo  : Postgres triggers (debounced 3s) → sync-odoo-push
--   2. Odoo → AniXOS  : Odoo Automation Rules → odoo-webhook-receiver → sync-odoo-pull
--   3. Reconciliation : Cron every 30 min → sync-odoo-pull / sync-odoo-push (full)
--
-- Prerequisites:
--   - pg_cron enabled  ✅
--   - pg_net enabled   ✅
--   - CRON_INTERNAL_SECRET set in Edge Functions Secrets  ✅
--   - app.supabase_project_ref set (see bottom of this file)
--   - app.odoo_cron_secret set (see bottom of this file)
--
-- Safe to run multiple times (IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Debounce table (prevents flooding Edge Functions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.odoo_push_debounce (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_triggered_at timestamptz NOT NULL DEFAULT now(),
  pending_count integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.odoo_push_debounce IS
  'Debounce table for odoo push triggers — prevents flooding sync-odoo-push';

ALTER TABLE public.odoo_push_debounce ENABLE ROW LEVEL SECURITY;
-- No policies → only service role (internal use)

-- ----------------------------------------------------------------------------
-- 2. Helper: get configuration values safely
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._odoo_get_config(p_key text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN current_setting(p_key, true);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Core: trigger a scoped pull for one company
--    p_scope: { "model": "res.partner", "record_id": 42 }  (optional)
--    When scope is NULL, does a full pull.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_odoo_pull(
  p_company_id uuid,
  p_scope jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_project_ref text;
  v_secret text;
  v_url text;
  v_request_id bigint;
BEGIN
  v_project_ref := public._odoo_get_config('app.supabase_project_ref');
  v_secret := public._odoo_get_config('app.odoo_cron_secret');

  IF v_project_ref IS NULL OR v_project_ref = '' THEN
    RAISE WARNING 'app.supabase_project_ref is not set — pull aborted';
    RETURN NULL;
  END IF;

  v_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/sync-odoo-pull';

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'company_id', p_company_id,
      'scope', p_scope
    )),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Core: trigger a scoped push for one company
--    p_scope: { "table": "clients", "record_id": "uuid..." }  (optional)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_odoo_push(
  p_company_id uuid,
  p_scope jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_project_ref text;
  v_secret text;
  v_url text;
  v_request_id bigint;
BEGIN
  v_project_ref := public._odoo_get_config('app.supabase_project_ref');
  v_secret := public._odoo_get_config('app.odoo_cron_secret');

  IF v_project_ref IS NULL OR v_project_ref = '' THEN
    RAISE WARNING 'app.supabase_project_ref is not set — push aborted';
    RETURN NULL;
  END IF;

  v_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/sync-odoo-push';

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'company_id', p_company_id,
      'scope', p_scope
    )),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Wrappers: trigger for all active companies
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_odoo_pull_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT company_id FROM public.odoo_config
    WHERE is_active = true
  LOOP
    PERFORM public.trigger_odoo_pull(r.company_id, NULL);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_odoo_push_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT company_id FROM public.odoo_config
    WHERE is_active = true
  LOOP
    PERFORM public.trigger_odoo_push(r.company_id, NULL);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Debounced trigger function (used by all table triggers)
--
-- Debounce window: 3 seconds. Multiple rapid changes → single push.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_odoo_push_debounced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_last_at timestamptz;
  v_pending int;
  v_debounce_secs int := 3;
  v_table_name text;
  v_record_id text;
BEGIN
  -- Determine company_id (works for both INSERT and UPDATE, DELETE not wired)
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip if integration is inactive
  IF NOT EXISTS (
    SELECT 1 FROM public.odoo_config
    WHERE company_id = v_company_id AND is_active = true
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check debounce window
  SELECT last_triggered_at, pending_count
  INTO v_last_at, v_pending
  FROM public.odoo_push_debounce
  WHERE company_id = v_company_id;

  IF v_last_at IS NOT NULL AND
     (now() - v_last_at) < (v_debounce_secs || ' seconds')::interval THEN
    -- Within window: increment pending counter, skip HTTP call
    UPDATE public.odoo_push_debounce
    SET pending_count = COALESCE(v_pending, 0) + 1
    WHERE company_id = v_company_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Outside window: trigger push now, reset counter
  v_table_name := TG_TABLE_NAME;
  v_record_id := (COALESCE(NEW.id, OLD.id))::text;

  INSERT INTO public.odoo_push_debounce (company_id, last_triggered_at, pending_count)
  VALUES (v_company_id, now(), 0)
  ON CONFLICT (company_id) DO UPDATE
    SET last_triggered_at = now(),
        pending_count = 0;

  PERFORM public.trigger_odoo_push(
    v_company_id,
    jsonb_build_object('table', v_table_name, 'record_id', v_record_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Attach triggers to source tables
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_odoo_push_clients ON public.clients;
CREATE TRIGGER trg_odoo_push_clients
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.notify_odoo_push_debounced();

DROP TRIGGER IF EXISTS trg_odoo_push_projects ON public.projects;
CREATE TRIGGER trg_odoo_push_projects
  AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_odoo_push_debounced();

DROP TRIGGER IF EXISTS trg_odoo_push_pieces ON public.pieces_tasks;
CREATE TRIGGER trg_odoo_push_pieces
  AFTER INSERT OR UPDATE ON public.pieces_tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_odoo_push_debounced();

-- Work sessions: only fire when ended_at transitions from NULL → set
DROP TRIGGER IF EXISTS trg_odoo_push_sessions ON public.work_sessions;
CREATE TRIGGER trg_odoo_push_sessions
  AFTER UPDATE ON public.work_sessions
  FOR EACH ROW
  WHEN (NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL)
  EXECUTE FUNCTION public.notify_odoo_push_debounced();

-- ----------------------------------------------------------------------------
-- 8. Cleanup: prune debounce rows older than 1 hour
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_odoo_debounce()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.odoo_push_debounce
  WHERE last_triggered_at < now() - interval '1 hour'
    AND pending_count = 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Schedule cron jobs
-- ----------------------------------------------------------------------------

-- Remove old jobs (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('odoo-reconcile-pull')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'odoo-reconcile-pull');
  PERFORM cron.unschedule('odoo-reconcile-push')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'odoo-reconcile-push');
  PERFORM cron.unschedule('odoo-prune-debounce')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'odoo-prune-debounce');
EXCEPTION WHEN OTHERS THEN
  -- ignore errors if pg_cron unavailable during migration
  NULL;
END $$;

-- Reconciliation pull: every 30 minutes
SELECT cron.schedule(
  'odoo-reconcile-pull',
  '*/30 * * * *',
  $$ SELECT public.trigger_odoo_pull_all(); $$
);

-- Reconciliation push: every 30 minutes, offset by 15 min
SELECT cron.schedule(
  'odoo-reconcile-push',
  '15,45 * * * *',
  $$ SELECT public.trigger_odoo_push_all(); $$
);

-- Prune debounce: every hour
SELECT cron.schedule(
  'odoo-prune-debounce',
  '0 * * * *',
  $$ SELECT public.prune_odoo_debounce(); $$
);

-- ============================================================================
-- NEXT STEPS (run once, in SQL Editor):
-- ============================================================================
--
-- ALTER DATABASE postgres SET app.supabase_project_ref = 'xxxxx';
-- ALTER DATABASE postgres SET app.odoo_cron_secret = 'xxxxx';
--
-- Where:
--   - xxxxx (project_ref)    = the subdomain of your Supabase URL
--                              (e.g., "abcdefgh" from "abcdefgh.supabase.co")
--   - xxxxx (cron_secret)    = same value as CRON_INTERNAL_SECRET in
--                              Supabase Edge Functions Secrets
--
-- Verify with:
--   SELECT current_setting('app.supabase_project_ref', true);
--   SELECT current_setting('app.odoo_cron_secret', true) IS NOT NULL AS has_secret;
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'odoo-%';
-- ============================================================================
