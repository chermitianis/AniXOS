-- ============================================================================
-- 0066_odoo_sync_modules_extend.sql
-- Étend la valeur par défaut de odoo_config.sync_modules à 12 modules
-- ============================================================================

alter table odoo_config
  alter column sync_modules set default '{
    "clients": true,
    "suppliers": false,
    "projects": false,
    "manufacturing_orders": false,
    "work_orders": false,
    "machines": false,
    "workcenters": false,
    "workers": false,
    "staff": false,
    "planning": false,
    "materials": false,
    "invoices": false
  }'::jsonb;

comment on column odoo_config.sync_modules is
  'Modules à synchroniser depuis Odoo : clients, suppliers, projects, manufacturing_orders, work_orders, machines, workcenters, workers, staff, planning, materials, invoices';