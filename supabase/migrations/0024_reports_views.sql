-- ============================================================================
-- 0024_reports_views.sql
-- Views حسابية حقيقية (وليست تجميعات وهمية) تعتمد كلياً على work_sessions
-- الفعلية. security_invoker=true يضمن تطبيق RLS الخاص بالمستخدم الفعلي
-- الذي يستعلم عن الـ view، وليس صلاحيات منشئ الـ view — أساسي لعزل الشركات.
-- ============================================================================

-- ------------------------------------------------------------------
-- v_project_actuals: الوقت والتكلفة الفعليان الحقيقيان لكل مشروع، مستخرَجان
-- مباشرة من work_sessions (وليس تقديراً)
-- ------------------------------------------------------------------
create or replace view v_project_actuals
with (security_invoker = true) as
select
  p.id                as project_id,
  p.company_id,
  p.name              as project_name,
  p.code              as project_code,
  p.status,
  p.estimated_hours,
  p.quoted_price,
  p.due_date,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'production'), 0) / 3600.0
    as actual_production_hours,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'downtime'), 0) / 3600.0
    as actual_downtime_hours,

  -- التكلفة الفعلية للعمالة المباشرة: مجموع (ساعات كل جلسة × تكلفة ساعة العامل)
  coalesce(sum(
    (ws.duration_seconds / 3600.0) * w.hourly_cost
  ) filter (where ws.session_type = 'production'), 0) as actual_labor_cost

from projects p
left join work_sessions ws on ws.project_id = p.id and ws.ended_at is not null
left join workers w on w.id = ws.worker_id
group by p.id, p.company_id, p.name, p.code, p.status, p.estimated_hours, p.quoted_price, p.due_date;

comment on view v_project_actuals is 'الوقت/التكلفة الفعليان الحقيقيان لكل مشروع، محسوبان من work_sessions المُغلقة فعلياً';

-- ------------------------------------------------------------------
-- v_project_profitability: صافي الربح لكل مشروع (السعر المتفق عليه - التكلفة
-- الفعلية للعمالة)، مع فارق الوقت (الفعلي مقابل التقديري) كنسبة مئوية
-- ------------------------------------------------------------------
create or replace view v_project_profitability
with (security_invoker = true) as
select
  a.*,
  (a.quoted_price - a.actual_labor_cost) as net_profit,

  case
    when a.estimated_hours is null or a.estimated_hours = 0 then null
    else round(((a.actual_production_hours - a.estimated_hours) / a.estimated_hours * 100)::numeric, 1)
  end as time_variance_percent,

  -- مؤشر المخاطر: يصنَّف بناءً على فارق الوقت وموعد التسليم معاً
  case
    when a.status = 'completed' then 'completed'
    when a.due_date is not null and a.due_date < current_date and a.status != 'completed' then 'delayed'
    when a.estimated_hours is not null and a.estimated_hours > 0
      and a.actual_production_hours > a.estimated_hours * 1.15 then 'at_risk'
    else 'on_track'
  end as risk_status

from v_project_actuals a;

comment on view v_project_profitability is 'صافي الربح ومؤشر المخاطر لكل مشروع؛ الأساس المباشر لشاشة المدير التنفيذية';

-- ------------------------------------------------------------------
-- v_live_operations: كل الجلسات المفتوحة حالياً (عمال/آلات تعمل الآن)
-- ------------------------------------------------------------------
create or replace view v_live_operations
with (security_invoker = true) as
select
  ws.id               as session_id,
  ws.company_id,
  ws.session_type,
  ws.started_at,
  extract(epoch from (now() - ws.started_at))::integer as elapsed_seconds,

  w.id                as worker_id,
  w.full_name         as worker_name,

  m.id                as machine_id,
  m.name              as machine_name,

  p.id                as project_id,
  p.name              as project_name,

  tt.name             as task_type_name,
  sr.name             as stop_reason_name

from work_sessions ws
join workers w on w.id = ws.worker_id
left join machines m on m.id = ws.machine_id
left join projects p on p.id = ws.project_id
left join task_types tt on tt.id = ws.task_type_id
left join stop_reasons sr on sr.id = ws.stop_reason_id
where ws.ended_at is null;

comment on view v_live_operations is 'كل الجلسات المفتوحة حالياً؛ أساس المشاهدة الحية (Live Operations Feed) في لوحة المدير';

-- ------------------------------------------------------------------
-- v_inventory_low_stock: أصناف المخزون التي وصلت لحد التنبيه أو تجاوزته
-- ------------------------------------------------------------------
create or replace view v_inventory_low_stock
with (security_invoker = true) as
select *
from inventory_items
where is_active = true and quantity_on_hand <= reorder_threshold;

comment on view v_inventory_low_stock is 'أصناف المخزون التي تحتاج إعادة طلب؛ أساس تنبيهات النقص التلقائية';
