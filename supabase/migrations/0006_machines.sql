-- ============================================================================
-- 0006_machines.sql
-- آلات ومعدات الورشة، مع حالتها الحية (تُحدَّث من work_sessions لاحقاً)
-- ============================================================================

create table if not exists machines (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  name            text not null,
  code            text not null,                -- كود داخلي: CNC-01
  machine_type    text,                          -- نوع الآلة (خراطة، تفريز، ليزر...)
  location        text,

  -- الحالة الحية: تُحدَّث تلقائياً من محرك الجلسات (work_sessions) وليست يدوية
  current_status  text not null default 'idle'
                  check (current_status in ('running', 'idle', 'maintenance', 'stopped')),

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (company_id, code)
);

comment on table machines is 'آلات الورشة وحالتها التشغيلية الحية';

create index if not exists idx_machines_company on machines (company_id);

create trigger trg_machines_updated_at
before update on machines
for each row execute function set_updated_at();

-- إكمال الربط المؤجَّل من 0004_devices.sql (الآلة الافتراضية لكل كشك)
alter table devices
  add constraint fk_devices_default_machine
  foreign key (default_machine_id) references machines(id) on delete set null;
