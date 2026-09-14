-- 0031_kiosk_tools_and_handoffs.sql
-- أدوات الآلات ورسائل التسليم بين العمال
create table if not exists machine_tools (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  tool_number integer not null,
  tool_name text not null default '',
  diameter numeric(10,3),
  status text not null default 'empty' check (status in ('available', 'empty')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_id, tool_number)
);
create index if not exists idx_machine_tools_machine on machine_tools(machine_id, tool_number);
create trigger trg_machine_tools_updated_at before update on machine_tools for each row execute function set_updated_at();
alter table machine_tools enable row level security;
create policy machine_tools_select on machine_tools for select using (company_id = get_my_company_id());
create policy machine_tools_insert on machine_tools for insert with check (company_id = get_my_company_id());
create policy machine_tools_update on machine_tools for update using (company_id = get_my_company_id());
create policy machine_tools_delete on machine_tools for delete using (company_id = get_my_company_id());

alter table machines add column if not exists tool_count integer not null default 0 check (tool_count >= 0);

create table if not exists piece_handoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  piece_task_id uuid not null references pieces_tasks(id) on delete cascade,
  from_worker_id uuid references workers(id) on delete set null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_piece_handoffs_piece on piece_handoffs(piece_task_id, created_at desc);
alter table piece_handoffs enable row level security;
create policy piece_handoffs_select on piece_handoffs for select using (company_id = get_my_company_id());
create policy piece_handoffs_insert on piece_handoffs for insert with check (company_id = get_my_company_id());
create policy piece_handoffs_update on piece_handoffs for update using (company_id = get_my_company_id());
comment on table machine_tools is 'أدوات كل آلة، مع حالة الأداة القابلة للتبديل من الكشك';
comment on table piece_handoffs is 'رسائل تسليم القطع بين العمال';
