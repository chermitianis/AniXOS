// ============================================================================
// accountingApi — helpers Supabase pour le module Comptabilité
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export type SupplierInvoiceStatus =
  | "brouillon"
  | "recue"
  | "payee"
  | "en_retard"
  | "annulee";

export interface SupplierInvoice {
  id: string;
  company_id: string;
  invoice_number: string;
  supplier_name: string;
  supplier_email: string | null;
  supplier_phone: string | null;
  issue_date: string;
  due_date: string | null;
  payment_date: string | null;
  amount_ht: number;
  vat_rate: number;
  amount_ttc: number;
  status: SupplierInvoiceStatus;
  category: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientInvoice {
  id: string;
  company_id: string;
  invoice_number: string;
  client_id: string | null;
  project_id: string | null;
  issue_date: string;
  due_date: string | null;
  total: number;
  status: string;              // draft | issued | paid | overdue | cancelled
  created_at: string;
}

export interface AccountingSummary {
  company_id: string;
  revenue_paid: number;
  revenue_total: number;
  pending_revenue: number;
  expenses_paid: number;
  expenses_total: number;
  pending_expenses: number;
  overdue_invoices_count: number;
  overdue_supplier_invoices_count: number;
}

// ----------------------------------------------------------------------------
// KPI
// ----------------------------------------------------------------------------

export async function fetchAccountingSummary(): Promise<AccountingSummary | null> {
  const { data, error } = await supabase
    .from("v_accounting_summary")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as AccountingSummary | null;
}

// ----------------------------------------------------------------------------
// CLIENT INVOICES (lecture seule — les factures sont créées ailleurs)
// ----------------------------------------------------------------------------

export async function listClientInvoices(): Promise<ClientInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return (data as ClientInvoice[]) ?? [];
}

// ----------------------------------------------------------------------------
// SUPPLIER INVOICES
// ----------------------------------------------------------------------------

export async function listSupplierInvoices(): Promise<SupplierInvoice[]> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("*")
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return (data as SupplierInvoice[]) ?? [];
}

export async function createSupplierInvoice(
  input: Omit<SupplierInvoice, "id" | "company_id" | "created_at" | "updated_at">,
  companyId: string,
): Promise<SupplierInvoice> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .insert({ ...input, company_id: companyId })
    .select()
    .single();

  if (error) throw error;
  return data as SupplierInvoice;
}

export async function updateSupplierInvoice(
  id: string,
  patch: Partial<SupplierInvoice>,
): Promise<void> {
  const { error } = await supabase
    .from("supplier_invoices")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteSupplierInvoice(id: string): Promise<void> {
  const { error } = await supabase
    .from("supplier_invoices")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ----------------------------------------------------------------------------
// CALCUL TTC
// ----------------------------------------------------------------------------

export function computeTTC(amountHT: number, vatRate: number): number {
  return Math.round(amountHT * (1 + vatRate / 100) * 1000) / 1000;
}

// ----------------------------------------------------------------------------
// EXPORT CSV
// ----------------------------------------------------------------------------

export function exportSupplierInvoicesToCsv(invoices: SupplierInvoice[]): string {
  const headers = [
    "N° facture",
    "Fournisseur",
    "Date d'émission",
    "Échéance",
    "Montant HT",
    "TVA (%)",
    "Montant TTC",
    "Statut",
    "Catégorie",
    "Référence",
  ];

  const rows = invoices.map((inv) => [
    inv.invoice_number,
    inv.supplier_name,
    inv.issue_date,
    inv.due_date ?? "",
    inv.amount_ht.toString(),
    inv.vat_rate.toString(),
    inv.amount_ttc.toString(),
    inv.status,
    inv.category ?? "",
    inv.reference ?? "",
  ]);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map((row) => row.map(escape).join(";"));

  return lines.join("\n");
}