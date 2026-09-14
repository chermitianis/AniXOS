-- 0041_french_company_roles.sql
-- الأدوار الافتراضية بالفرنسية، ونسخ قابلة للتعديل داخل كل شركة.
update roles set name = case code
  when 'owner' then 'Directeur général / Propriétaire'
  when 'supervisor' then 'Chef d’atelier'
  when 'engineering' then 'Ingénierie et projets'
  when 'accounting' then 'Comptabilité et finance'
  when 'hr' then 'Ressources humaines'
  else name
end
where company_id is null;

do $$
declare c record; tpl record; cloned_id uuid;
begin
  for c in select id from companies loop
    for tpl in select code, name, permissions from roles where company_id is null loop
      if not exists (select 1 from roles r where r.company_id = c.id and r.code = tpl.code) then
        insert into roles(company_id, code, name, is_system, permissions)
        values (c.id, tpl.code, tpl.name, false, tpl.permissions)
        returning id into cloned_id;
        update staff_users set role_id = cloned_id
        where company_id = c.id and role_id in (select id from roles where company_id is null and code = tpl.code);
      end if;
    end loop;
  end loop;
end $$;

drop policy if exists roles_insert on roles;
create policy roles_insert on roles for insert with check (
  company_id = get_my_company_id() and exists (
    select 1 from staff_users s where s.id = auth.uid() and s.company_id = roles.company_id and s.is_owner = true
  )
);

drop policy if exists roles_update on roles;
create policy roles_update on roles for update using (
  company_id = get_my_company_id() and exists (
    select 1 from staff_users s where s.id = auth.uid() and s.company_id = roles.company_id and s.is_owner = true
  )
) with check (company_id = get_my_company_id());

drop policy if exists roles_delete on roles;
create policy roles_delete on roles for delete using (
  company_id = get_my_company_id() and exists (
    select 1 from staff_users s where s.id = auth.uid() and s.company_id = roles.company_id and s.is_owner = true
  )
);
