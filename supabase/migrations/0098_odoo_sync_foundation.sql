-- ============================================================================
-- supabase/migrations/0098_odoo_sync_foundation.sql
--
-- Foundation for unified bidirectional sync between AniXOS and Odoo.
--
-- Concepts:
--   - Concept Registry     : single source of truth for AniXOS↔Odoo mapping
--   - Conflicts            : duplicate detection + admin alerts
--   - Origin tracking      : last_synced_from prevents infinite loops
--   - Soft delete          : deleted_at instead of hard DELETE
--   - Odoo write date      : odoo_write_date allows last-write-wins
--
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- Additive only — does not modify existing columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Concept Registry — the "language" shared by both systems
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.odoo_sync_concepts (
  concept_key text PRIMARY KEY,
  anixos_table text NOT NULL,
  anixos_id_column text NOT NULL DEFAULT 'id',
  anixos_odoo_id_column text NOT NULL DEFAULT 'odoo_id',
  anixos_company_column text NOT NULL DEFAULT 'company_id',
  anixos_label_column text NOT NULL DEFAULT 'name',
  odoo_model text NOT NULL,
  odoo_id_field text NOT NULL DEFAULT 'id',
  odoo_name_field text NOT NULL DEFAULT 'name',
  odoo_domain jsonb DEFAULT '[]'::jsonb,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.odoo_sync_concepts IS
  'Single source of truth mapping AniXOS concepts to Odoo models';

-- Seed — the initial 6 concepts
INSERT INTO public.odoo_sync_concepts
  (concept_key, anixos_table, anixos_label_column, odoo_model, odoo_name_field, odoo_domain, description)
VALUES
  ('client',   'clients',      'name', 'res.partner',
   'name', '[["customer_rank", ">", 0]]'::jsonb,
   'Customers (Odoo: res.partner with customer_rank > 0)'),

  ('supplier', 'clients',      'name', 'res.partner',
   'name', '[["supplier_rank", ">", 0]]'::jsonb,
   'Suppliers (Odoo: res.partner with supplier_rank > 0)'),

  ('project',  'projects',     'name', 'project.project',
   'name', '[]'::jsonb,
   'Projects'),

  ('task',     'pieces_tasks', 'name', 'project.task',
   'name', '[]'::jsonb,
   'Tasks / Pièces — same concept, different UI labels'),

  ('worker',   'workers',      'full_name', 'hr.employee',
   'name', '[]'::jsonb,
   'Workers (Odoo: hr.employee)'),

  ('machine',  'machines',     'name', 'maintenance.equipment',
   'name', '[]'::jsonb,
   'Machines (Odoo: maintenance.equipment)')
ON CONFLICT (concept_key) DO UPDATE SET
  anixos_table = EXCLUDED.anixos_table,
  anixos_label_column = EXCLUDED.anixos_label_column,
  odoo_model = EXCLUDED.odoo_model,
  odoo_name_field = EXCLUDED.odoo_name_field,
  odoo_domain = EXCLUDED.odoo_domain,
  description = EXCLUDED.description,
  updated_at = now();

-- RLS — read for owner, write restricted
ALTER TABLE public.odoo_sync_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "concepts_select_authenticated" ON public.odoo_sync_concepts;
CREATE POLICY "concepts_select_authenticated"
  ON public.odoo_sync_concepts FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies → only service role manages

-- ----------------------------------------------------------------------------
-- 2. Conflict tracking — duplicate detection
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.odoo_sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  concept_key text NOT NULL REFERENCES public.odoo_sync_concepts(concept_key),
  odoo_record_id integer,
  odoo_record_name text,
  anixos_record_id uuid,
  anixos_record_name text,
  conflict_reason text NOT NULL,
  -- conflict_reason values:
  --   'duplicate_name'      — same name found on both sides
  --   'create_on_both'      — record created locally AND remotely
  --   'write_conflict'      — both modified after last sync
  --   'delete_conflict'     — one side deleted, other side modified
  status text NOT NULL DEFAULT 'pending',
  -- status values:
  --   'pending'             — awaiting admin decision
  --   'keep_odoo'           — resolved: keep Odoo version, discard AniXOS
  --   'keep_anixos'         — resolved: keep AniXOS version, discard Odoo
  --   'merged'              — resolved: both linked, keeping AniXOS id
  --   'dismissed'           — resolved: ignore (false positive)
  metadata jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  CONSTRAINT odoo_sync_conflicts_status_check CHECK (
    status IN ('pending', 'keep_odoo', 'keep_anixos', 'merged', 'dismissed')
  )
);

COMMENT ON TABLE public.odoo_sync_conflicts IS
  'Duplicate detection and conflict resolution between AniXOS and Odoo';

CREATE INDEX IF NOT EXISTS odoo_sync_conflicts_company_status_idx
  ON public.odoo_sync_conflicts (company_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS odoo_sync_conflicts_concept_idx
  ON public.odoo_sync_conflicts (concept_key, odoo_record_id);

-- RLS
ALTER TABLE public.odoo_sync_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conflicts_select_owner" ON public.odoo_sync_conflicts;
CREATE POLICY "conflicts_select_owner"
  ON public.odoo_sync_conflicts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_users
      WHERE auth_user_id = auth.uid()
        AND company_id = odoo_sync_conflicts.company_id
        AND is_owner = true
    )
  );

DROP POLICY IF EXISTS "conflicts_update_owner" ON public.odoo_sync_conflicts;
CREATE POLICY "conflicts_update_owner"
  ON public.odoo_sync_conflicts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_users
      WHERE auth_user_id = auth.uid()
        AND company_id = odoo_sync_conflicts.company_id
        AND is_owner = true
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Origin tracking columns — added to all synced tables
-- ----------------------------------------------------------------------------

-- clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_synced_from text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS odoo_write_date timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_synced_from text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS odoo_write_date timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- pieces_tasks
ALTER TABLE public.pieces_tasks
  ADD COLUMN IF NOT EXISTS last_synced_from text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS odoo_write_date timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- workers
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS last_synced_from text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS odoo_write_date timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- machines
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS last_synced_from text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS odoo_write_date timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. Constraints on last_synced_from
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clients', 'projects', 'pieces_tasks', 'workers', 'machines']
  LOOP
    EXECUTE format('
      ALTER TABLE public.%I
      DROP CONSTRAINT IF EXISTS %I_last_synced_from_check;
    ', tbl, tbl);

    EXECUTE format('
      ALTER TABLE public.%I
      ADD CONSTRAINT %I_last_synced_from_check
      CHECK (last_synced_from IS NULL OR last_synced_from IN (''odoo'', ''anixos''));
    ', tbl, tbl);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Performance indexes for reconciliation
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS clients_pending_sync_idx
  ON public.clients (company_id, odoo_id, last_synced_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_pending_sync_idx
  ON public.projects (company_id, odoo_id, last_synced_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pieces_pending_sync_idx
  ON public.pieces_tasks (company_id, odoo_id, last_synced_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS workers_pending_sync_idx
  ON public.workers (company_id, odoo_id, last_synced_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS machines_pending_sync_idx
  ON public.machines (company_id, odoo_id, last_synced_at)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 6. Helper — detect duplicate candidates for one concept
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_duplicates_for_concept(
  p_company_id uuid,
  p_concept_key text
)
RETURNS TABLE (
  anixos_id uuid,
  anixos_name text,
  odoo_id integer,
  odoo_name text,
  match_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_concept RECORD;
BEGIN
  SELECT * INTO v_concept
  FROM public.odoo_sync_concepts
  WHERE concept_key = p_concept_key AND is_active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Name-based duplicate detection:
  -- AniXOS record (odoo_id IS NULL) that has same name as an Odoo record
  -- (tracked in a separate mapping... at runtime, we compare after both sides are pulled)
  --
  -- NOTE: This is a helper skeleton. Full logic lives in the Edge Function
  -- because it requires calling Odoo's search_read.

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.find_duplicates_for_concept(uuid, text) IS
  'Placeholder — full duplicate detection runs in Edge Function (needs Odoo API)';

-- ============================================================================
-- DONE
--
-- Next steps:
--   1. Deploy this migration
--   2. Verify:
--      SELECT * FROM odoo_sync_concepts ORDER BY concept_key;
--      SELECT column_name FROM information_schema.columns
--        WHERE table_name = 'projects' AND column_name LIKE '%synced%';
--   3. Then update sync-odoo-pull and sync-odoo-push for:
--      - Origin tracking (last_synced_from)
--      - Soft delete (deleted_at)
--      - Duplicate detection (odoo_sync_conflicts)
--   4. Then build the conflict resolution UI in AniXOS
-- ============================================================================
