-- ============================================================================
-- 0023_new_tables_rls.sql
-- نفس نمط RLS المُختبر سابقاً على كل الجداول الجديدة في هذه الدفعة
-- ============================================================================

alter table manufacturing_orders enable row level security;
create policy manufacturing_orders_select on manufacturing_orders for select using (company_id = get_my_company_id());
create policy manufacturing_orders_insert on manufacturing_orders for insert with check (company_id = get_my_company_id());
create policy manufacturing_orders_update on manufacturing_orders for update using (company_id = get_my_company_id());
create policy manufacturing_orders_delete on manufacturing_orders for delete using (company_id = get_my_company_id());

alter table inventory_items enable row level security;
create policy inventory_items_select on inventory_items for select using (company_id = get_my_company_id());
create policy inventory_items_insert on inventory_items for insert with check (company_id = get_my_company_id());
create policy inventory_items_update on inventory_items for update using (company_id = get_my_company_id());
create policy inventory_items_delete on inventory_items for delete using (company_id = get_my_company_id());

alter table inventory_transactions enable row level security;
create policy inventory_tx_select on inventory_transactions for select using (company_id = get_my_company_id());
create policy inventory_tx_insert on inventory_transactions for insert with check (company_id = get_my_company_id());
-- لا نسمح بتعديل أو حذف حركات المخزون إطلاقاً (أثر تدقيقي دائم)؛ أي تصحيح
-- يجب أن يكون عبر حركة "adjustment" جديدة، وليس تعديل حركة سابقة

alter table quotes enable row level security;
create policy quotes_select on quotes for select using (company_id = get_my_company_id());
create policy quotes_insert on quotes for insert with check (company_id = get_my_company_id());
create policy quotes_update on quotes for update using (company_id = get_my_company_id());
create policy quotes_delete on quotes for delete using (company_id = get_my_company_id());

alter table quote_items enable row level security;
create policy quote_items_select on quote_items for select using (company_id = get_my_company_id());
create policy quote_items_insert on quote_items for insert with check (company_id = get_my_company_id());
create policy quote_items_update on quote_items for update using (company_id = get_my_company_id());
create policy quote_items_delete on quote_items for delete using (company_id = get_my_company_id());

alter table invoices enable row level security;
create policy invoices_select on invoices for select using (company_id = get_my_company_id());
create policy invoices_insert on invoices for insert with check (company_id = get_my_company_id());
create policy invoices_update on invoices for update using (company_id = get_my_company_id());
create policy invoices_delete on invoices for delete using (company_id = get_my_company_id());

alter table invoice_items enable row level security;
create policy invoice_items_select on invoice_items for select using (company_id = get_my_company_id());
create policy invoice_items_insert on invoice_items for insert with check (company_id = get_my_company_id());
create policy invoice_items_update on invoice_items for update using (company_id = get_my_company_id());
create policy invoice_items_delete on invoice_items for delete using (company_id = get_my_company_id());
