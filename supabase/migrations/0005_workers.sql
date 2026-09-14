-- ============================================================================
-- 0005_workers.sql
-- العامل هو بيانات تشغيلية ضمن حساب الشركة (مثل الآلة أو العميل تماماً)
-- وليس حساباً مستقلاً. الدخول عبر اسم مستخدم + كلمة سر يتحقق منها
-- Edge Function خاص (worker-login) وليس عبر Supabase Auth.
-- ============================================================================

create table if not exists workers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  full_name       text not null,
  username        text not null,
  password_hash   text not null,               -- bcrypt hash، يُتحقق منه داخل Edge Function فقط
  rfid_code       text,                         -- دخول بديل عبر بطاقة RFID

  photo_url       text,
  hourly_cost     numeric(12,2) not null default 0,  -- تكلفة الساعة المباشرة (لحساب صافي الربح)
  skill_level     text,                          -- مستوى الكفاءة (اختياري)

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (company_id, username)
);

comment on table workers is 'عمال الورشة: بيانات تشغيلية بسيطة (بدون Supabase Auth)، دخولهم عبر worker-login';

create index if not exists idx_workers_company on workers (company_id);
create unique index if not exists idx_workers_rfid on workers (company_id, rfid_code) where rfid_code is not null;

create trigger trg_workers_updated_at
before update on workers
for each row execute function set_updated_at();
