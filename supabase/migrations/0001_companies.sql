-- ============================================================================
-- 0001_companies.sql
-- جدول الشركات (Tenants) — كل شركة تستخدم ANIXOS لها صف واحد هنا
-- هذا الجدول هو مركز عزل البيانات بين المشتركين (Multi-Tenant Isolation)
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists companies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  industry          text,                                   -- نوع النشاط الصناعي
  logo_url          text,
  currency          text not null default 'USD',
  timezone          text not null default 'UTC',

  -- وضع تشغيل الشركة الحالي: مستقل بالكامل / سحابي / مرتبط بـ Odoo
  operation_mode    text not null default 'standalone'
                    check (operation_mode in ('standalone', 'saas', 'odoo_hybrid')),

  subscription_plan text not null default 'trial'
                    check (subscription_plan in ('trial', 'active', 'suspended', 'cancelled')),

  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table companies is 'كل صف يمثل مساحة عمل مستقلة ومعزولة لشركة مشتركة في ANIXOS';

-- تحديث updated_at تلقائياً عند أي تعديل
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_companies_updated_at
before update on companies
for each row execute function set_updated_at();
