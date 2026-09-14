-- 0042_fix_role_rls_and_backfill.sql
-- إصلاح رفض إنشاء الدور بسبب فحص staff_users داخل RLS، وإنشاء النسخ الفرنسية الناقصة.
create or replace function is_my_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_users
    where id = auth.uid()
      and company_id = target_company_id
      and is_owner = true
      and is_active = true
  );
$$;
revoke all on function is_my_company_owner(uuid) from public;
grant execute on function is_my_company_owner(uuid) to authenticated;

do $$
declare c record; tpl record;
begin
  for c in select id from companies loop
    for tpl in select code, name, permissions from roles where company_id is null loop
      insert into roles(company_id, code, name, is_system, permissions)
      values (c.id, tpl.code, tpl.name, false, tpl.permissions)
      on conflict (company_id, code) do update set
        name = case when roles.name is null or roles.name = '' then excluded.name else roles.name end,
        permissions = case when roles.permissions = '{}'::jsonb then excluded.permissions else roles.permissions end;
    end loop;
  end loop;
end $$;

drop policy if exists roles_insert on roles;
create policy roles_insert on roles for insert
with check (company_id = get_my_company_id() and is_my_company_owner(company_id));

drop policy if exists roles_update on roles;
create policy roles_update on roles for update
using (company_id = get_my_company_id() and is_my_company_owner(company_id))
with check (company_id = get_my_company_id());

drop policy if exists roles_delete on roles;
create policy roles_delete on roles for delete
using (company_id = get_my_company_id() and is_my_company_owner(company_id));
