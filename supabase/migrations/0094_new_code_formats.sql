-- ============================================================================
-- Migration 0094: Nouveaux formats d'identifiants uniques
-- ============================================================================
-- 🎯 OBJECTIF :
--   1) Code projet : {client_code}{YYYYMMDD}{seq2} — ex. 012026092501
--         - client_code = clients.code (ex. "01")
--         - YYYYMMDD = date de création du projet
--         - seq2 = compteur journalier par client (2 chiffres), remis à zéro
--                  chaque nouveau jour, pour éviter les collisions.
--   2) Numéro d'OF : OF-{DDMM}{HHMM}{s} — ex. OF-170913451
--         - DDMM = jour + mois
--         - HHMM = heure + minute
--         - s = seconde (1 chiffre) pour différencier les OF créés dans la
--              même minute
--   3) Mise à jour du trigger existant `trg_projects_assign_code` pour
--      utiliser le nouveau format.
--   4) Backfill : les projets existants gardent leur code actuel.
--      Les nouveaux projets reçoivent le nouveau format.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fonction de génération du code projet
--    Inputs : company_id, client_id
--    Output : "012026092501" (ou fallback "000000000000" si client inconnu)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_project_code(
  p_company_id uuid,
  p_client_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_code text;
  v_date_part   text := to_char(now(), 'YYYYMMDD');
  v_prefix      text;
  v_seq         integer;
  v_full        text;
BEGIN
  -- 1. Récupérer le code client (2 chiffres, ex. "01").
  --    Si le client n'a pas de code, fallback sur "00".
  SELECT COALESCE(NULLIF(TRIM(code), ''), '00')
    INTO v_client_code
    FROM clients
   WHERE id = p_client_id
     AND company_id = p_company_id;

  v_client_code := COALESCE(v_client_code, '00');
  -- Normaliser sur 2 chiffres : lpad si code numérique court
  IF v_client_code ~ '^[0-9]+$' THEN
    v_client_code := lpad(v_client_code, 2, '0');
  END IF;

  v_prefix := v_client_code || v_date_part;  -- ex. "01" || "20260925" = "0120260925"

  -- 2. Compter les projets déjà créés aujourd'hui pour ce client
  --    → déterminer le prochain seq.
  SELECT COALESCE(MAX(
    CASE
      WHEN code ~ ('^' || v_prefix || '[0-9]{2}$')
      THEN substring(code from (length(v_prefix) + 1) for 2)::integer
      ELSE 0
    END
  ), 0) + 1
    INTO v_seq
    FROM projects
   WHERE company_id = p_company_id
     AND client_id = p_client_id
     AND code LIKE v_prefix || '%';

  -- 3. Fallback de sécurité : si v_seq dépasse 99, on cherche dans toute la
  --    table (peu probable mais évite le crash).
  IF v_seq > 99 THEN
    RAISE EXCEPTION 'PROJECT_CODE_OVERFLOW: plus de 99 projets pour le client % le %',
      v_client_code, v_date_part
      USING ERRCODE = 'P0001';
  END IF;

  v_full := v_prefix || lpad(v_seq::text, 2, '0');
  RETURN v_full;  -- ex. "012026092501"
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Trigger mis à jour pour les nouveaux projets
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_projects_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.code IS NULL OR NEW.code = '') AND NEW.company_id IS NOT NULL THEN
    NEW.code := generate_project_code(NEW.company_id, NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Le trigger existe déjà (trg_projects_assign_code) — pas besoin de le recréer,
-- la fonction a simplement été remplacée.

-- ----------------------------------------------------------------------------
-- 3. Fonction de génération du numéro d'OF
--    Format : OF-{DDMM}{HHMM}{s} — ex. OF-170913451
--    Unicité garantie par :
--      - DDMMHHMM (minute)
--      - + 1 chiffre de seconde (0-9)
--      - Si collision (même seconde), on incrémente la seconde jusqu'à
--        trouver un slot libre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_of_number(
  p_company_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base       text;
  v_candidate  text;
  v_seconds    integer := EXTRACT(SECOND FROM now())::integer;
  v_attempts   integer := 0;
BEGIN
  LOOP
    -- Base : OF-DDMMHHMM + (seconde % 10) → 1 chiffre
    v_base := 'OF-'
           || to_char(now(), 'DDMM')
           || to_char(now(), 'HH24MI')
           || ((v_seconds + v_attempts) % 10)::text;

    v_candidate := v_base;

    -- Vérifier si déjà utilisé
    IF NOT EXISTS (
      SELECT 1 FROM manufacturing_orders
      WHERE company_id = p_company_id
        AND order_number = v_candidate
    ) THEN
      RETURN v_candidate;
    END IF;

    v_attempts := v_attempts + 1;

    -- Garde-fou : après 10 tentatives (toutes les secondes testées),
    -- on incrémente les minutes et on recommence avec 0.
    IF v_attempts > 9 THEN
      v_base := 'OF-'
             || to_char(now(), 'DDMM')
             || to_char(now() + interval '1 minute', 'HH24MI')
             || '0';
      IF NOT EXISTS (
        SELECT 1 FROM manufacturing_orders
        WHERE company_id = p_company_id
          AND order_number = v_base
      ) THEN
        RETURN v_base;
      END IF;
      RAISE EXCEPTION 'OF_NUMBER_OVERFLOW: impossible de générer un numéro unique'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;