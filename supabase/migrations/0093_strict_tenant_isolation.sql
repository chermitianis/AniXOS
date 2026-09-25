-- ============================================================================
-- Migration 0093: Strict tenant isolation (machines, workers, planning + défense)
-- ============================================================================
-- 🔒 OBJECTIF : garantir l'isolation TOTALE des données entre sociétés.
--
--   Couche 1 — RLS sur SELECT (machines, workers) : interdit la lecture
--              cross-tenant (les policies avaient `qual = true` → fuite).
--   Couche 2 — Unification de TOUTES les policies sur `get_my_company_id()`
--              (helper qui respecte active_company_id).
--   Couche 3 — Trigger de défense en profondeur : rejette TOUTE insertion
--              ou mise à jour qui référence un worker/machine d'une autre
--              société (même si le code front oublie un `.eq()`).
--   Couche 4 — Nettoyage des données corrompues existantes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX RLS — machines
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS machines_select ON machines;
CREATE POLICY machines_select ON machines
  FOR SELECT USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS machines_insert ON machines;
CREATE POLICY machines_insert ON machines
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS machines_update ON machines;
CREATE POLICY machines_update ON machines
  FOR UPDATE
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS machines_delete ON machines;
CREATE POLICY machines_delete ON machines
  FOR DELETE USING (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 2. FIX RLS — workers
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS workers_select ON workers;
CREATE POLICY workers_select ON workers
  FOR SELECT USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS workers_insert ON workers;
CREATE POLICY workers_insert ON workers
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS workers_update ON workers;
CREATE POLICY workers_update ON workers
  FOR UPDATE
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS workers_delete ON workers;
CREATE POLICY workers_delete ON workers
  FOR DELETE USING (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 3. Unifier les tables qui utilisaient l'ancienne sous-requête staff_users
--    (piece_documents) — incohérent avec active_company_id.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS piece_documents_select_company ON piece_documents;
CREATE POLICY piece_documents_select_company ON piece_documents
  FOR SELECT USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS piece_documents_insert_company ON piece_documents;
CREATE POLICY piece_documents_insert_company ON piece_documents
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS piece_documents_update_company ON piece_documents;
CREATE POLICY piece_documents_update_company ON piece_documents
  FOR UPDATE
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

DROP POLICY IF EXISTS piece_documents_delete_company ON piece_documents;
CREATE POLICY piece_documents_delete_company ON piece_documents
  FOR DELETE USING (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 4. Trigger de défense en profondeur — planning
--    Vérifie que le worker_id et machine_id référencés appartiennent à la
--    même société que le planning. Rejette la transaction sinon.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_planning_tenant_isolation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_worker_company uuid;
  v_machine_company uuid;
BEGIN
  -- Worker (obligatoire)
  SELECT company_id INTO v_worker_company FROM workers WHERE id = NEW.worker_id;
  IF v_worker_company IS NULL THEN
    RAISE EXCEPTION 'PLANNING_INVALID_WORKER: worker % introuvable', NEW.worker_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_worker_company <> NEW.company_id THEN
    RAISE EXCEPTION 'PLANNING_CROSS_TENANT_WORKER: worker % appartient à une autre société',
      NEW.worker_id USING ERRCODE = 'P0001';
  END IF;

  -- Machine (optionnelle)
  IF NEW.machine_id IS NOT NULL THEN
    SELECT company_id INTO v_machine_company FROM machines WHERE id = NEW.machine_id;
    IF v_machine_company IS NULL THEN
      RAISE EXCEPTION 'PLANNING_INVALID_MACHINE: machine % introuvable', NEW.machine_id
        USING ERRCODE = 'P0001';
    END IF;
    IF v_machine_company <> NEW.company_id THEN
      RAISE EXCEPTION 'PLANNING_CROSS_TENANT_MACHINE: machine % appartient à une autre société',
        NEW.machine_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_planning_tenant_isolation ON planning;
CREATE TRIGGER trg_enforce_planning_tenant_isolation
  BEFORE INSERT OR UPDATE ON planning
  FOR EACH ROW
  EXECUTE FUNCTION enforce_planning_tenant_isolation();

-- ----------------------------------------------------------------------------
-- 5. Trigger de défense en profondeur — work_sessions
--    Même logique : worker, machine, project, piece_task, shift doivent
--    tous appartenir à la même société que la session.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_work_session_tenant_isolation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company uuid;
BEGIN
  -- worker obligatoire
  SELECT company_id INTO v_company FROM workers WHERE id = NEW.worker_id;
  IF v_company IS NULL OR v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'WORK_SESSION_CROSS_TENANT_WORKER: worker % hors société', NEW.worker_id
      USING ERRCODE = 'P0001';
  END IF;

  -- machine optionnelle
  IF NEW.machine_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM machines WHERE id = NEW.machine_id;
    IF v_company IS NULL OR v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'WORK_SESSION_CROSS_TENANT_MACHINE: machine % hors société', NEW.machine_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- project optionnel
  IF NEW.project_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM projects WHERE id = NEW.project_id;
    IF v_company IS NULL OR v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'WORK_SESSION_CROSS_TENANT_PROJECT: project % hors société', NEW.project_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- piece_task optionnel
  IF NEW.piece_task_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM pieces_tasks WHERE id = NEW.piece_task_id;
    IF v_company IS NULL OR v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'WORK_SESSION_CROSS_TENANT_PIECE: piece % hors société', NEW.piece_task_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- shift optionnel
  IF NEW.shift_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM work_shifts WHERE id = NEW.shift_id;
    IF v_company IS NULL OR v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'WORK_SESSION_CROSS_TENANT_SHIFT: shift % hors société', NEW.shift_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_work_session_tenant_isolation ON work_sessions;
CREATE TRIGGER trg_enforce_work_session_tenant_isolation
  BEFORE INSERT OR UPDATE ON work_sessions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_work_session_tenant_isolation();

-- ----------------------------------------------------------------------------
-- 6. Nettoyage des données corrompues (planning)
-- ----------------------------------------------------------------------------
-- 6.a) Supprimer les entries où le worker appartient à une autre société
DELETE FROM planning p
USING workers w
WHERE p.worker_id = w.id
  AND p.company_id <> w.company_id;

-- 6.b) Détacher les machine_id cross-tenant
UPDATE planning p
SET machine_id = NULL
FROM machines m
WHERE p.machine_id = m.id
  AND p.company_id <> m.company_id;

-- 6.c) Idem pour work_sessions (si corrompues)
UPDATE work_sessions ws
SET machine_id = NULL
FROM machines m
WHERE ws.machine_id = m.id
  AND ws.company_id <> m.company_id;

-- ============================================================================
-- Vérifications post-migration (à exécuter séparément) :
--
--   -- 0 ligne attendue :
--   SELECT p.id FROM planning p JOIN workers w ON w.id = p.worker_id
--   WHERE p.company_id <> w.company_id;
--
--   -- 0 ligne attendue :
--   SELECT p.id FROM planning p JOIN machines m ON m.id = p.machine_id
--   WHERE p.company_id <> m.company_id;
--
--   -- 0 ligne attendue :
--   SELECT ws.id FROM work_sessions ws JOIN machines m ON m.id = ws.machine_id
--   WHERE ws.company_id <> m.company_id;
-- ============================================================================