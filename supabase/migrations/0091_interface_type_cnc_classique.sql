-- ============================================================================
-- Migration 0091: Interface Type CNC / Classique
-- ============================================================================
-- الهدف: توحيد مصطلح "classique" بدل "manual"، وإضافة interface_type إلى
--        task_types و stop_reasons لفلترة أزرار Kiosk حسب دور العامل.
--
-- المرحلة 1 (آمنة، قابلة للتراجع): توسيع القيم المسموحة + إضافة الأعمدة.
-- المرحلة 2 (منفصلة لاحقًا): إزالة 'manual' من CHECK بعد التأكد.
-- ============================================================================

-- 1. توسيع CHECK على machines.interface_type (إضافة 'classique')
ALTER TABLE machines 
  DROP CONSTRAINT IF EXISTS machines_interface_type_check;
ALTER TABLE machines 
  ADD CONSTRAINT machines_interface_type_check 
  CHECK (interface_type IN ('cnc', 'classique', 'manual', 'both'));

-- 2. توسيع CHECK على workers.interface_type (إضافة 'classique')
ALTER TABLE workers 
  DROP CONSTRAINT IF EXISTS workers_interface_type_check;
ALTER TABLE workers 
  ADD CONSTRAINT workers_interface_type_check 
  CHECK (interface_type IN ('cnc', 'classique', 'manual', 'both'));

-- 3. ترحيل البيانات: 'manual' → 'classique'
UPDATE machines SET interface_type = 'classique' WHERE interface_type = 'manual';
UPDATE workers  SET interface_type = 'classique' WHERE interface_type = 'manual';

-- 4. تحديث القيم الافتراضية للاتساق
ALTER TABLE machines ALTER COLUMN interface_type SET DEFAULT 'classique';
-- workers يبقى 'both' — لأن العامل قد يعمل على النوعين

-- 5. إضافة interface_type إلى task_types
ALTER TABLE task_types 
  ADD COLUMN IF NOT EXISTS interface_type text 
  NOT NULL DEFAULT 'both';

ALTER TABLE task_types 
  DROP CONSTRAINT IF EXISTS task_types_interface_type_check;
ALTER TABLE task_types 
  ADD CONSTRAINT task_types_interface_type_check 
  CHECK (interface_type IN ('cnc', 'classique', 'both'));

CREATE INDEX IF NOT EXISTS idx_task_types_interface_type 
  ON task_types (company_id, interface_type) 
  WHERE is_active = true;

-- 6. إضافة interface_type إلى stop_reasons
ALTER TABLE stop_reasons 
  ADD COLUMN IF NOT EXISTS interface_type text 
  NOT NULL DEFAULT 'both';

ALTER TABLE stop_reasons 
  DROP CONSTRAINT IF EXISTS stop_reasons_interface_type_check;
ALTER TABLE stop_reasons 
  ADD CONSTRAINT stop_reasons_interface_type_check 
  CHECK (interface_type IN ('cnc', 'classique', 'both'));

CREATE INDEX IF NOT EXISTS idx_stop_reasons_interface_type 
  ON stop_reasons (company_id, interface_type) 
  WHERE is_active = true;

-- ============================================================================
-- ملاحظات:
-- - CHECK على task_types/stop_reasons لا يشمل 'manual' (لأنها جديدة، لا
--   تحتاج توافقية مع بيانات قديمة).
-- - CHECK على machines/workers يشمل 'manual' مؤقتًا حتى migration 0092.
-- - الترحيل UPDATE آمن: 'manual' كانت قيمة default لم تُستخدم بكثافة.
-- ============================================================================