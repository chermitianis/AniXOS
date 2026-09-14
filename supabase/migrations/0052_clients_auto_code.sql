-- ============================================================================
-- 0052_clients_auto_code.sql
-- كل عميل يحصل على كود تسلسلي (01، 02...) تلقائياً عند الإنشاء، لكل شركة على
-- حدة. هذا الكود يُستخدم كأساس لتوليد كود المشروع تلقائياً (اسم_العميل + تاريخ).
-- ============================================================================

alter table clients add column if not exists code text;

create or replace function assign_client_code()
returns trigger
language plpgsql
as $$
declare
  next_code integer;
begin
  if new.code is null or new.code = '' then
    select coalesce(max(code::integer), 0) + 1 into next_code
    from clients
    where company_id = new.company_id
      and code ~ '^[0-9]+$';

    new.code := lpad(next_code::text, 2, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_auto_code on clients;
create trigger trg_clients_auto_code
before insert on clients
for each row execute function assign_client_code();

-- تعبئة الكود للعملاء الموجودين مسبقاً (حسب تاريخ الإنشاء لكل شركة)
with numbered as (
  select id, row_number() over (partition by company_id order by created_at) as rn
  from clients
  where code is null
)
update clients c
set code = lpad(numbered.rn::text, 2, '0')
from numbered
where c.id = numbered.id;

create unique index if not exists idx_clients_company_code on clients (company_id, code);

comment on column clients.code is 'كود العميل التسلسلي (01، 02...) داخل شركته — يُستخدم في تركيب كود المشروع التلقائي';
