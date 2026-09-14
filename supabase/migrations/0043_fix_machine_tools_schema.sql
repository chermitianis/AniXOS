-- 0043_fix_machine_tools_schema.sql
-- ============================================================================
-- إصلاح تعارض حرج بين 0031 و0032: كلاهما أنشأ machine_tools بأعمدة مختلفة.
-- بما أن 0031 نُفّذ أولاً، فإن "CREATE TABLE IF NOT EXISTS" في 0032 لم يُنفَّذ
-- فعلياً (no-op)، فبقي الجدول الحقيقي بأعمدة 0031 (tool_name, diameter, status)
-- بينما كل الواجهة (MachineToolsModal.tsx, localDb.ts) تقرأ/تكتب أعمدة 0032
-- (tool_diameter, is_occupied) غير الموجودة أصلاً في القاعدة الحقيقية.
-- هذا الملف يهاجر الجدول نهائياً إلى مخطط 0032 (المعتمد فعلياً في الكود).
-- ============================================================================

-- 1) إضافة الأعمدة المفقودة إن لم تكن موجودة
alter table machine_tools add column if not exists tool_diameter numeric(10,2) default 0.00;
alter table machine_tools add column if not exists is_occupied boolean not null default true;

-- 2) ترحيل البيانات من الأعمدة القديمة (diameter/status) إن وُجدت
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_tools' and column_name = 'diameter'
  ) then
    update machine_tools set tool_diameter = coalesce(diameter, 0) where tool_diameter = 0.00;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine_tools' and column_name = 'status'
  ) then
    update machine_tools set is_occupied = (status = 'available');
  end if;
end $$;

-- 3) حذف الأعمدة القديمة نهائياً بعد الترحيل
alter table machine_tools drop column if exists diameter;
alter table machine_tools drop column if exists status;

-- 4) تنظيف السياسات المكرّرة (0031 أنشأ 4 سياسات منفصلة + 0032 أضاف سياسة
--    خامسة FOR ALL بنفس الأثر) — نُبقي على سياسة واحدة واضحة لكل عملية.
drop policy if exists machine_tools_company_isolation on machine_tools;
drop policy if exists machine_tools_select on machine_tools;
drop policy if exists machine_tools_insert on machine_tools;
drop policy if exists machine_tools_update on machine_tools;
drop policy if exists machine_tools_delete on machine_tools;

create policy machine_tools_select on machine_tools for select using (company_id = get_my_company_id());
create policy machine_tools_insert on machine_tools for insert with check (company_id = get_my_company_id());
create policy machine_tools_update on machine_tools for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy machine_tools_delete on machine_tools for delete using (company_id = get_my_company_id());

comment on table machine_tools is 'أدوات كل آلة (tool_diameter, is_occupied) — المخطط الموحّد المعتمد فعلياً من الواجهة';

-- ============================================================================
-- حذف الجدول اليتيم piece_handoff_notes (0032): لا يستخدمه أي كود في الواجهة
-- (تم التأكد عبر grep شامل على apps/web/src وsupabase/functions) — الجدول
-- الفعلي المستخدم لميزة Passation هو piece_handoffs (0031) فقط.
-- ============================================================================
drop table if exists piece_handoff_notes;
