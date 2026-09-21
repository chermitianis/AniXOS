-- ============================================================================
-- 0063_harden_insert_policies.sql
--
-- الغرض: فرض company_id = get_my_company_id() على كل سياسات INSERT
--
-- المشكلة المكتشفة:
--   كل الجداول التشغيلية لها سياسة INSERT بـ qual = NULL
--   أي WITH CHECK (true) ضمنيًا.
--
--   الأثر: أي مستخدم مصادق عليه (حتى staff) يمكنه:
--       supabase.from('workers').insert({ company_id: 'other_company_id', ... })
--   → حقن بيانات في شركات أخرى = تسريب + تلاعب.
--
-- الحل: إعادة كتابة سياسات INSERT بـ WITH CHECK يفرض company_id.
--
-- الجداول المُعالَجة (30): activity_log, clients, devices, inventory_items,
--   inventory_transactions, invoice_items, invoices, machine_maintenance_log,
--   machine_tools, machines, manufacturing_orders, nomenclature_cells,
--   nomenclature_columns, nomenclature_rows, nomenclatures, piece_handoffs,
--   pieces_tasks, planning, projects, quote_items, quotes, shift_piece_work,
--   stop_reasons, task_types, work_session_corrections, work_sessions,
--   work_shifts, workers, workshop_reclamations
--
-- استثناءات خاصة:
--   - staff_users: owner-only
--   - roles: owner-only
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- الجزء 1: الجداول التشغيلية القياسية
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  tables_standard TEXT[] := ARRAY[
    'activity_log', 'clients', 'devices', 'inventory_items',
    'inventory_transactions', 'invoice_items', 'invoices',
    'machine_maintenance_log', 'machine_tools', 'machines',
    'manufacturing_orders', 'nomenclature_cells', 'nomenclature_columns',
    'nomenclature_rows', 'nomenclatures', 'piece_handoffs', 'pieces_tasks',
    'planning', 'projects', 'quote_items', 'quotes', 'shift_piece_work',
    'stop_reasons', 'task_types', 'work_session_corrections',
    'work_sessions', 'work_shifts', 'workers', 'workshop_reclamations'
  ];
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_standard LOOP
    policy_name := tbl || '_insert';

    -- حذف السياسة القديمة
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);

    -- إنشاء سياسة جديدة صارمة
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (company_id = get_my_company_id())',
      policy_name, tbl
    );

    RAISE NOTICE 'Hardened INSERT policy on %.%', 'public', tbl;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- الجزء 2: staff_users — owner-only
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_users_insert ON public.staff_users;
CREATE POLICY staff_users_insert ON public.staff_users
  FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND is_my_company_owner(company_id)
  );

-- ----------------------------------------------------------------------------
-- الجزء 3: roles — owner-only
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS roles_insert ON public.roles;
CREATE POLICY roles_insert ON public.roles
  FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND is_my_company_owner(company_id)
  );

COMMIT;

-- ============================================================================
-- تحقق بعد التنفيذ:
--   SELECT tablename, policyname, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND cmd = 'INSERT'
--   ORDER BY tablename;
-- المتوقع: كل صف فيه with_check غير NULL
-- ============================================================================