-- ============================================================================
-- supabase/migrations/0096_odoo_integration_ids.sql
--
-- Adds Odoo integration IDs to resource tables for bidirectional sync.
--
-- Purpose:
--   Allow AniXOS to pull resources (machines, workers) from Odoo with stable
--   references, and push reports back to Odoo (project.task.write,
--   account.analytic.line.create) with correct cross-references.
--
-- Changes:
--   1. machines                 → + odoo_id, + unique (company_id, odoo_id)
--   2. workers                  → + odoo_id, + unique, DROP NOT NULL on
--                                 password_hash and username (Odoo workers
--                                 don't have credentials until an admin sets them)
--   3. manufacturing_orders     → + odoo_id, + unique
--   4. planning                 → + odoo_id, + unique
--   5. work_sessions            → + odoo_timesheet_id (link to Odoo analytic.line)
--   6. odoo_config              → + stage_mappings (cache Odoo project.task.type)
--
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. machines
-- ----------------------------------------------------------------------------
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS odoo_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS machines_company_odoo_id_unique
  ON public.machines (company_id, odoo_id)
  WHERE odoo_id IS NOT NULL;

COMMENT ON COLUMN public.machines.odoo_id IS
  'Reference to Odoo maintenance.equipment.id (nullable until first pull)';

-- ----------------------------------------------------------------------------
-- 2. workers
--    NOTE: password_hash and username are DROPPED NOT NULL because workers
--    pulled from Odoo don't have credentials until an admin assigns them.
-- ----------------------------------------------------------------------------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS odoo_id integer;

ALTER TABLE public.workers
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.workers
  ALTER COLUMN username DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workers_company_odoo_id_unique
  ON public.workers (company_id, odoo_id)
  WHERE odoo_id IS NOT NULL;

COMMENT ON COLUMN public.workers.odoo_id IS
  'Reference to Odoo hr.employee.id (nullable until first pull)';

COMMENT ON COLUMN public.workers.password_hash IS
  'NULL for workers pulled from Odoo — admin must assign a password';

COMMENT ON COLUMN public.workers.username IS
  'NULL for workers pulled from Odoo — auto-generated as odoo_<id> if needed';

-- ----------------------------------------------------------------------------
-- 3. manufacturing_orders
-- ----------------------------------------------------------------------------
ALTER TABLE public.manufacturing_orders
  ADD COLUMN IF NOT EXISTS odoo_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS mfg_orders_company_odoo_id_unique
  ON public.manufacturing_orders (company_id, odoo_id)
  WHERE odoo_id IS NOT NULL;

COMMENT ON COLUMN public.manufacturing_orders.odoo_id IS
  'Reference to Odoo mrp.production.id (nullable until first pull)';

-- ----------------------------------------------------------------------------
-- 4. planning
-- ----------------------------------------------------------------------------
ALTER TABLE public.planning
  ADD COLUMN IF NOT EXISTS odoo_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS planning_company_odoo_id_unique
  ON public.planning (company_id, odoo_id)
  WHERE odoo_id IS NOT NULL;

COMMENT ON COLUMN public.planning.odoo_id IS
  'Reference to Odoo planning.slot.id (nullable until first pull)';

-- ----------------------------------------------------------------------------
-- 5. work_sessions
--    Used to link AniXOS work sessions to Odoo account.analytic.line rows.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS odoo_timesheet_id integer;

COMMENT ON COLUMN public.work_sessions.odoo_timesheet_id IS
  'Reference to Odoo account.analytic.line.id after push (idempotency key)';

-- ----------------------------------------------------------------------------
-- 6. odoo_config — cache stage mappings
-- ----------------------------------------------------------------------------
ALTER TABLE public.odoo_config
  ADD COLUMN IF NOT EXISTS stage_mappings jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.odoo_config.stage_mappings IS
  'Cached mapping: { "project.task.type.name": id } — refreshed on each pull';
