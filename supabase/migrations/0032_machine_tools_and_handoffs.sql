-- ============================================================================
-- 0032_machine_tools_and_handoffs.sql
-- 
-- 1. إضافة جداول أدوات الماكينة (machine_tools)
-- 2. إضافة جدول رسائل وملاحظات التسليم بين العمال (piece_handoff_notes)
-- 3. نقل وتحديث حقل الوقت المقدر (estimated_minutes) من المشاريع إلى القطع
-- ============================================================================

-- 1. جدول أدوات الماكينات
CREATE TABLE IF NOT EXISTS public.machine_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  tool_number INT NOT NULL,
  tool_name TEXT NOT NULL DEFAULT '',
  tool_diameter NUMERIC(10, 2) DEFAULT 0.00,
  is_occupied BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(machine_id, tool_number)
);

-- 2. جدول ملاحظات التسليم والتعاقب (Passation Notes)
CREATE TABLE IF NOT EXISTS public.piece_handoff_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  piece_task_id UUID NOT NULL REFERENCES public.pieces_tasks(id) ON DELETE CASCADE,
  author_worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_by_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. التأكد من وجود حقل الوقت المقدر بالدقائق في جدول القطع (pieces_tasks)
ALTER TABLE public.pieces_tasks 
ADD COLUMN IF NOT EXISTS estimated_minutes NUMERIC(10, 2) DEFAULT 0.00;

-- 4. إضافة عدد الأدوات الافتراضي لجدول الماكينات (machines) إن لم يكن موجوداً
ALTER TABLE public.machines 
ADD COLUMN IF NOT EXISTS total_tool_slots INT DEFAULT 10;

-- تمكين سياسات الأمان RLS للجداول الجديدة
ALTER TABLE public.machine_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piece_handoff_notes ENABLE ROW LEVEL SECURITY;

-- سياسات RLS للوصول عبر company_id
CREATE POLICY "machine_tools_company_isolation" ON public.machine_tools
  FOR ALL USING (company_id = public.get_my_company_id());

CREATE POLICY "piece_handoff_notes_company_isolation" ON public.piece_handoff_notes
  FOR ALL USING (company_id = public.get_my_company_id());