-- ============================================================================
-- 0015_odoo_config.sql
-- إعدادات اتصال كل شركة بنظام Odoo الخاص بها (إن كانت تستخدم الوضع الهجين)
-- ============================================================================

create table if not exists odoo_config (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null unique references companies(id) on delete cascade,

  odoo_url            text not null,
  odoo_db             text not null,
  odoo_username       text not null,
  -- كلمة السر/مفتاح API يُخزَّن مشفَّراً؛ فك التشفير يتم فقط داخل Edge Functions
  -- عبر service_role، لا يُقرأ أبداً من الواجهة الأمامية مباشرة.
  api_key_encrypted   text not null,

  is_active           boolean not null default false,
  last_sync_at        timestamptz,
  last_sync_status    text check (last_sync_status in ('success', 'failed', 'partial')),
  last_sync_error     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table odoo_config is 'إعدادات ربط الشركة بـ Odoo SaaS/On-Premise؛ الحقول الحساسة تُقرأ فقط عبر Edge Functions';

create trigger trg_odoo_config_updated_at
before update on odoo_config
for each row execute function set_updated_at();
