-- ============================================================================
-- 0030_nomenclature_rls.sql
-- نفس نمط RLS المُختبر سابقاً على كل جداول Nomenclature الأربعة
-- ============================================================================

alter table nomenclatures enable row level security;
create policy nomenclatures_select on nomenclatures for select using (company_id = get_my_company_id());
create policy nomenclatures_insert on nomenclatures for insert with check (company_id = get_my_company_id());
create policy nomenclatures_update on nomenclatures for update using (company_id = get_my_company_id());
create policy nomenclatures_delete on nomenclatures for delete using (company_id = get_my_company_id());

alter table nomenclature_columns enable row level security;
create policy nomenclature_columns_select on nomenclature_columns for select using (company_id = get_my_company_id());
create policy nomenclature_columns_insert on nomenclature_columns for insert with check (company_id = get_my_company_id());
create policy nomenclature_columns_update on nomenclature_columns for update using (company_id = get_my_company_id());
create policy nomenclature_columns_delete on nomenclature_columns for delete using (company_id = get_my_company_id());

alter table nomenclature_rows enable row level security;
create policy nomenclature_rows_select on nomenclature_rows for select using (company_id = get_my_company_id());
create policy nomenclature_rows_insert on nomenclature_rows for insert with check (company_id = get_my_company_id());
create policy nomenclature_rows_update on nomenclature_rows for update using (company_id = get_my_company_id());
create policy nomenclature_rows_delete on nomenclature_rows for delete using (company_id = get_my_company_id());

alter table nomenclature_cells enable row level security;
create policy nomenclature_cells_select on nomenclature_cells for select using (company_id = get_my_company_id());
create policy nomenclature_cells_insert on nomenclature_cells for insert with check (company_id = get_my_company_id());
create policy nomenclature_cells_update on nomenclature_cells for update using (company_id = get_my_company_id());
create policy nomenclature_cells_delete on nomenclature_cells for delete using (company_id = get_my_company_id());
