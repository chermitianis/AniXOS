-- ============================================================================
-- 0064_odoo_config_extend.sql
-- توسيع جدول odoo_config لدعم ميزات Odoo SaaS الكاملة:
--   - اختيار الوحدات المراد مزامنتها
--   - اتجاه المزامنة
--   - اختبار الاتصال
--   - إحصائيات آخر مزامنة
-- ============================================================================

alter table odoo_config
  add column if not exists sync_modules jsonb not null default '{
    "clients": true,
    "projects": false,
    "invoices": false,
    "suppliers": false
  }'::jsonb,
  add column if not exists sync_direction text not null default 'pull'
    check (sync_direction in ('pull', 'push', 'bidirectional')),
  add column if not exists last_test_at timestamptz,
  add column if not exists last_test_status text
    check (last_test_status in ('success', 'failed')),
  add column if not exists last_test_error text,
  add column if not exists records_synced integer not null default 0,
  add column if not exists version text,
  add column if not exists notify_on_error boolean not null default true,
  add column if not exists auto_sync_enabled boolean not null default false,
  add column if not exists auto_sync_interval_minutes integer not null default 60;

comment on column odoo_config.sync_modules is
  'Modules à synchroniser : { "clients": bool, "projects": bool, "invoices": bool, "suppliers": bool }';
comment on column odoo_config.sync_direction is
  'Direction : pull (Odoo → AniXOS), push (AniXOS → Odoo), bidirectional';
comment on column odoo_config.auto_sync_enabled is
  'Synchronisation automatique activée';
comment on column odoo_config.auto_sync_interval_minutes is
  'Intervalle entre synchronisations automatiques (en minutes)';
comment on column odoo_config.notify_on_error is
  'Notifier l''admin par email en cas d''erreur de synchronisation';

-- Index pour les cron jobs (si activés plus tard)
create index if not exists idx_odoo_config_auto_sync
  on odoo_config (auto_sync_enabled, last_sync_at)
  where auto_sync_enabled = true and is_active = true;