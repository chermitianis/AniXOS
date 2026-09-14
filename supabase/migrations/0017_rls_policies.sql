-- ============================================================================
-- 0017_rls_policies.sql
-- تفعيل RLS على كل الجداول + سياسة موحدة: "company_id = get_my_company_id()"
-- هذا هو خط الدفاع الحقيقي لعزل بيانات الشركات (Multi-Tenant) على مستوى
-- قاعدة البيانات نفسها، وليس فقط على مستوى كود التطبيق.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- companies: كل مستخدم يرى فقط صف شركته
-- (إنشاء/حذف الشركة يتم حصراً عبر Edge Function tenant-provisioning بصلاحية
--  service_role، والتي تتجاوز RLS بطبيعتها)
-- ---------------------------------------------------------------------------
alter table companies enable row level security;

create policy companies_select on companies
  for select using (id = get_my_company_id());

create policy companies_update on companies
  for update using (id = get_my_company_id());

-- ---------------------------------------------------------------------------
-- roles: قوالب النظام (company_id IS NULL) مرئية للجميع، وأدوار الشركة
-- المخصصة مرئية/قابلة للتعديل فقط من نفس الشركة
-- ---------------------------------------------------------------------------
alter table roles enable row level security;

create policy roles_select on roles
  for select using (company_id is null or company_id = get_my_company_id());

create policy roles_insert on roles
  for insert with check (company_id = get_my_company_id());

create policy roles_update on roles
  for update using (company_id = get_my_company_id());

create policy roles_delete on roles
  for delete using (company_id = get_my_company_id());

-- ---------------------------------------------------------------------------
-- دالة مساعدة عامة تُطبَّق على معظم الجداول التشغيلية (نمط متكرر)
-- ---------------------------------------------------------------------------
-- (لا يوجد macro في PostgreSQL، لذا نكرر النمط صراحة لكل جدول لضمان الوضوح)

-- staff_users
alter table staff_users enable row level security;
create policy staff_users_select on staff_users for select using (company_id = get_my_company_id());
create policy staff_users_insert on staff_users for insert with check (company_id = get_my_company_id());
create policy staff_users_update on staff_users for update using (company_id = get_my_company_id());
create policy staff_users_delete on staff_users for delete using (company_id = get_my_company_id());

-- devices
alter table devices enable row level security;
create policy devices_select on devices for select using (company_id = get_my_company_id());
create policy devices_insert on devices for insert with check (company_id = get_my_company_id());
create policy devices_update on devices for update using (company_id = get_my_company_id());
create policy devices_delete on devices for delete using (company_id = get_my_company_id());

-- workers
alter table workers enable row level security;
create policy workers_select on workers for select using (company_id = get_my_company_id());
create policy workers_insert on workers for insert with check (company_id = get_my_company_id());
create policy workers_update on workers for update using (company_id = get_my_company_id());
create policy workers_delete on workers for delete using (company_id = get_my_company_id());

-- machines
alter table machines enable row level security;
create policy machines_select on machines for select using (company_id = get_my_company_id());
create policy machines_insert on machines for insert with check (company_id = get_my_company_id());
create policy machines_update on machines for update using (company_id = get_my_company_id());
create policy machines_delete on machines for delete using (company_id = get_my_company_id());

-- clients
alter table clients enable row level security;
create policy clients_select on clients for select using (company_id = get_my_company_id());
create policy clients_insert on clients for insert with check (company_id = get_my_company_id());
create policy clients_update on clients for update using (company_id = get_my_company_id());
create policy clients_delete on clients for delete using (company_id = get_my_company_id());

-- projects
alter table projects enable row level security;
create policy projects_select on projects for select using (company_id = get_my_company_id());
create policy projects_insert on projects for insert with check (company_id = get_my_company_id());
create policy projects_update on projects for update using (company_id = get_my_company_id());
create policy projects_delete on projects for delete using (company_id = get_my_company_id());

-- pieces_tasks
alter table pieces_tasks enable row level security;
create policy pieces_tasks_select on pieces_tasks for select using (company_id = get_my_company_id());
create policy pieces_tasks_insert on pieces_tasks for insert with check (company_id = get_my_company_id());
create policy pieces_tasks_update on pieces_tasks for update using (company_id = get_my_company_id());
create policy pieces_tasks_delete on pieces_tasks for delete using (company_id = get_my_company_id());

-- task_types
alter table task_types enable row level security;
create policy task_types_select on task_types for select using (company_id = get_my_company_id());
create policy task_types_insert on task_types for insert with check (company_id = get_my_company_id());
create policy task_types_update on task_types for update using (company_id = get_my_company_id());
create policy task_types_delete on task_types for delete using (company_id = get_my_company_id());

-- stop_reasons
alter table stop_reasons enable row level security;
create policy stop_reasons_select on stop_reasons for select using (company_id = get_my_company_id());
create policy stop_reasons_insert on stop_reasons for insert with check (company_id = get_my_company_id());
create policy stop_reasons_update on stop_reasons for update using (company_id = get_my_company_id());
create policy stop_reasons_delete on stop_reasons for delete using (company_id = get_my_company_id());

-- planning
alter table planning enable row level security;
create policy planning_select on planning for select using (company_id = get_my_company_id());
create policy planning_insert on planning for insert with check (company_id = get_my_company_id());
create policy planning_update on planning for update using (company_id = get_my_company_id());
create policy planning_delete on planning for delete using (company_id = get_my_company_id());

-- work_sessions (العامل عبر جهاز الكشك يحتاج insert/update لتسجيل جلساته)
alter table work_sessions enable row level security;
create policy work_sessions_select on work_sessions for select using (company_id = get_my_company_id());
create policy work_sessions_insert on work_sessions for insert with check (company_id = get_my_company_id());
create policy work_sessions_update on work_sessions for update using (company_id = get_my_company_id());
create policy work_sessions_delete on work_sessions for delete using (company_id = get_my_company_id());

-- activity_log (كتابة فقط من نفس الشركة، لا حذف/تعديل إطلاقاً — سجل تاريخي)
alter table activity_log enable row level security;
create policy activity_log_select on activity_log for select using (company_id = get_my_company_id());
create policy activity_log_insert on activity_log for insert with check (company_id = get_my_company_id());

-- ---------------------------------------------------------------------------
-- odoo_config: حماية إضافية — القراءة مقصورة على "مالك الحساب" فقط، حتى لو
-- كان المفتاح مشفَّراً، تقليلاً لسطح الهجوم لأقصى درجة ممكنة
-- ---------------------------------------------------------------------------
alter table odoo_config enable row level security;

create policy odoo_config_select on odoo_config
  for select using (
    exists (
      select 1 from staff_users
      where staff_users.id = auth.uid()
        and staff_users.company_id = odoo_config.company_id
        and staff_users.is_owner = true
    )
  );

create policy odoo_config_insert on odoo_config
  for insert with check (
    exists (
      select 1 from staff_users
      where staff_users.id = auth.uid()
        and staff_users.company_id = odoo_config.company_id
        and staff_users.is_owner = true
    )
  );

create policy odoo_config_update on odoo_config
  for update using (
    exists (
      select 1 from staff_users
      where staff_users.id = auth.uid()
        and staff_users.company_id = odoo_config.company_id
        and staff_users.is_owner = true
    )
  );
