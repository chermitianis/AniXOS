import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingUp, TrendingDown, DollarSign, Clock, AlertTriangle,
  Plus, Search, Download, Pencil, Trash2, Loader2, FileText,
  Building2, Calendar, BarChart3, FileBarChart, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { SupplierInvoiceModal } from "../components/SupplierInvoiceModal";
import {
  fetchAccountingSummary,
  listClientInvoices,
  listSupplierInvoices,
  createSupplierInvoice,
  updateSupplierInvoice,
  deleteSupplierInvoice,
  exportSupplierInvoicesToCsv,
  type AccountingSummary,
  type ClientInvoice,
  type SupplierInvoice,
} from "../api/accountingApi";

type TabKey = "overview" | "invoices" | "suppliers" | "reports";
type Period = "month" | "quarter" | "year" | "all";

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  issued: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-400",
};

const SUPPLIER_STATUS_COLORS: Record<string, string> = {
  brouillon: "bg-slate-100 text-slate-600",
  recue: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-red-100 text-red-700",
  annulee: "bg-slate-100 text-slate-400",
};

function isWithinPeriod(dateStr: string | null, period: Period): boolean {
  if (!dateStr) return period === "all";
  if (period === "all") return true;

  const date = new Date(dateStr);
  const now = new Date();

  if (period === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const dateQ = Math.floor(date.getMonth() / 3);
    return date.getFullYear() === now.getFullYear() && dateQ === q;
  }
  // year
  return date.getFullYear() === now.getFullYear();
}

export function AccountingAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierInvoice | null>(null);

  // ---------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------
  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [s, ci, si] = await Promise.all([
        fetchAccountingSummary(),
        listClientInvoices(),
        listSupplierInvoices(),
      ]);
      setSummary(s);
      setClientInvoices(ci);
      setSupplierInvoices(si);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // ---------------------------------------------------------------------
  // Filtres & KPIs
  // ---------------------------------------------------------------------
  const filteredClientInvoices = useMemo(
    () => clientInvoices.filter((i) => isWithinPeriod(i.issued_date, period)),  // ← corrigé
    [clientInvoices, period],
  );
  const filteredSupplierInvoices = useMemo(
    () => supplierInvoices.filter((i) => isWithinPeriod(i.issue_date, period)),
    [supplierInvoices, period],
  );

  const kpis = useMemo(() => {
    const revenuePaid = filteredClientInvoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.total), 0);

    const revenueTotal = filteredClientInvoices
      .filter((i) => i.status === "paid" || i.status === "issued")
      .reduce((s, i) => s + Number(i.total), 0);

    const pendingRevenue = filteredClientInvoices
      .filter((i) => i.status === "issued")
      .reduce((s, i) => s + Number(i.total), 0);

    const expensesPaid = filteredSupplierInvoices
      .filter((i) => i.status === "payee")
      .reduce((s, i) => s + Number(i.amount_ttc), 0);

    const expensesTotal = filteredSupplierInvoices
      .filter((i) => ["recue", "payee", "en_retard"].includes(i.status))
      .reduce((s, i) => s + Number(i.amount_ttc), 0);

    const pendingExpenses = filteredSupplierInvoices
      .filter((i) => ["recue", "en_retard"].includes(i.status))
      .reduce((s, i) => s + Number(i.amount_ttc), 0);

    const netProfit = revenueTotal - expensesTotal;

    const overdueInvoices = filteredClientInvoices.filter((i) => i.status === "overdue").length;
    const overdueSuppliers = filteredSupplierInvoices.filter((i) => i.status === "en_retard").length;

    return {
      revenuePaid,
      revenueTotal,
      pendingRevenue,
      expensesPaid,
      expensesTotal,
      pendingExpenses,
      netProfit,
      overdueInvoices,
      overdueSuppliers,
    };
  }, [filteredClientInvoices, filteredSupplierInvoices]);

  // ---------------------------------------------------------------------
  // Recherche
  // ---------------------------------------------------------------------
  const searchedSupplierInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredSupplierInvoices;
    return filteredSupplierInvoices.filter(
      (i) =>
        i.supplier_name.toLowerCase().includes(q) ||
        i.invoice_number.toLowerCase().includes(q) ||
        (i.category ?? "").toLowerCase().includes(q),
    );
  }, [filteredSupplierInvoices, search]);

  const searchedClientInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredClientInvoices;
    return filteredClientInvoices.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.client_id ?? "").toLowerCase().includes(q),
    );
  }, [filteredClientInvoices, search]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  async function handleSaveSupplier(data: Partial<SupplierInvoice>) {
    if (!staffUser) return;
    if (editingSupplier) {
      await updateSupplierInvoice(editingSupplier.id, data);
    } else {
      await createSupplierInvoice(
        {
          invoice_number: data.invoice_number ?? "",
          supplier_name: data.supplier_name ?? "",
          supplier_email: data.supplier_email ?? null,
          supplier_phone: data.supplier_phone ?? null,
          issue_date: data.issue_date ?? new Date().toISOString().slice(0, 10),
          due_date: data.due_date ?? null,
          payment_date: data.payment_date ?? null,
          amount_ht: data.amount_ht ?? 0,
          vat_rate: data.vat_rate ?? 19,
          amount_ttc: data.amount_ttc ?? 0,
          status: data.status ?? "brouillon",
          category: data.category ?? null,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          created_by: staffUser.id,
        },
        staffUser.company_id,
      );
    }
    setShowSupplierModal(false);
    setEditingSupplier(null);
    await load();
  }

  async function handleDeleteSupplier(inv: SupplierInvoice) {
    if (!window.confirm(t("accounting.confirmDeleteSupplier"))) return;
    await deleteSupplierInvoice(inv.id);
    await load();
  }

  function handleExportCsv() {
    const csv = exportSupplierInvoicesToCsv(searchedSupplierInvoices);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `factures-fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">{t("accounting.title")}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("accounting.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sélecteur de période */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="month">{t("accounting.periodMonth")}</option>
            <option value="quarter">{t("accounting.periodQuarter")}</option>
            <option value="year">{t("accounting.periodYear")}</option>
            <option value="all">{t("accounting.periodAll")}</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-green-200 bg-green-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-green-700">
            <ArrowUpRight size={13} />
            {t("accounting.kpi.revenue")}
          </div>
          <div className="mt-2 text-xl font-extrabold text-green-800" dir="ltr">
            {kpis.revenueTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            <span className="ms-1 text-xs font-medium text-green-500">TND</span>
          </div>
          {kpis.pendingRevenue > 0 && (
            <div className="mt-1 text-[11px] text-green-600" dir="ltr">
              {t("accounting.totalPending")}: {kpis.pendingRevenue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
            </div>
          )}
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-red-700">
            <ArrowDownRight size={13} />
            {t("accounting.kpi.expenses")}
          </div>
          <div className="mt-2 text-xl font-extrabold text-red-800" dir="ltr">
            {kpis.expensesTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            <span className="ms-1 text-xs font-medium text-red-500">TND</span>
          </div>
          {kpis.pendingExpenses > 0 && (
            <div className="mt-1 text-[11px] text-red-600" dir="ltr">
              {t("accounting.totalPending")}: {kpis.pendingExpenses.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
            </div>
          )}
        </div>

        <div
          className={`rounded-xl border p-4 ${
            kpis.netProfit >= 0
              ? "border-indigo-200 bg-indigo-50/60"
              : "border-amber-200 bg-amber-50/60"
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-600">
            <DollarSign size={13} />
            {t("accounting.kpi.netProfit")}
          </div>
          <div
            className={`mt-2 text-xl font-extrabold ${
              kpis.netProfit >= 0 ? "text-indigo-700" : "text-amber-700"
            }`}
            dir="ltr"
          >
            {kpis.netProfit.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            <span className="ms-1 text-xs font-medium opacity-70">TND</span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-amber-700">
            <AlertTriangle size={13} />
            {t("accounting.kpi.overdue")}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-xl font-extrabold text-amber-800">{kpis.overdueInvoices}</span>
            <span className="text-xs text-amber-600">{t("accounting.clients")}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-xl font-extrabold text-amber-800">{kpis.overdueSuppliers}</span>
            <span className="text-xs text-amber-600">{t("accounting.suppliers")}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {(["overview", "invoices", "suppliers", "reports"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t(`accounting.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="me-2 animate-spin" size={18} />
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Répartition CA vs Dépenses */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <BarChart3 size={15} className="text-indigo-600" />
                  {t("accounting.revenueVsExpenses")}
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-600">
                      <span>{t("accounting.kpi.revenue")}</span>
                      <span className="font-bold" dir="ltr">
                        {kpis.revenueTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-green-500"
                        style={{
                          width: `${Math.min(100, (kpis.revenueTotal / Math.max(kpis.revenueTotal, kpis.expensesTotal, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-600">
                      <span>{t("accounting.kpi.expenses")}</span>
                      <span className="font-bold" dir="ltr">
                        {kpis.expensesTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-red-500"
                        style={{
                          width: `${Math.min(100, (kpis.expensesTotal / Math.max(kpis.revenueTotal, kpis.expensesTotal, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Résumé texte */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <FileBarChart size={15} className="text-indigo-600" />
                  {t("accounting.summaryTitle")}
                </h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center justify-between">
                    <span>{t("accounting.summaryRevenuePaid")}</span>
                    <span className="font-bold text-green-700" dir="ltr">
                      {kpis.revenuePaid.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t("accounting.summaryExpensesPaid")}</span>
                    <span className="font-bold text-red-700" dir="ltr">
                      {kpis.expensesPaid.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                    </span>
                  </li>
                  <li className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span>{t("accounting.summaryNetProfit")}</span>
                    <span
                      className={`font-bold ${kpis.netProfit >= 0 ? "text-indigo-700" : "text-amber-700"}`}
                      dir="ltr"
                    >
                      {kpis.netProfit.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* INVOICES CLIENTS */}
          {activeTab === "invoices" && (
            <div className="space-y-3">
              <div className="relative max-w-sm">
                <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search")}
                  className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {searchedClientInvoices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <FileText size={32} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-sm text-slate-400">{t("accounting.noInvoices")}</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-start">N°</th>
                        <th className="px-3 py-2 text-start">Date</th>
                        <th className="px-3 py-2 text-end">Total</th>
                        <th className="px-3 py-2 text-start">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchedClientInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs" dir="ltr">{inv.invoice_number}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {new Date(inv.issued_date).toLocaleDateString()}   {/* ← corrigé */}
                          </td>
                          <td className="px-3 py-2 text-end font-semibold text-slate-700" dir="ltr">
                            {Number(inv.total).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${INVOICE_STATUS_COLORS[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {t(`accounting.status_${inv.status}`) || inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* INVOICES FOURNISSEURS */}
          {activeTab === "suppliers" && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-sm flex-1">
                  <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.search")}
                    className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {searchedSupplierInvoices.length > 0 && (
                    <button
                      onClick={handleExportCsv}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download size={13} />
                      {t("accounting.exportCsv")}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingSupplier(null);
                      setShowSupplierModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <Plus size={13} />
                    {t("accounting.addSupplierInvoice")}
                  </button>
                </div>
              </div>

              {searchedSupplierInvoices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <Building2 size={32} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-sm text-slate-400">{t("accounting.noSupplierInvoices")}</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-start">N° / Fournisseur</th>
                        <th className="px-3 py-2 text-start">Dates</th>
                        <th className="px-3 py-2 text-end">Montant TTC</th>
                        <th className="px-3 py-2 text-start">Statut</th>
                        <th className="px-3 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchedSupplierInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs text-slate-400" dir="ltr">{inv.invoice_number}</div>
                            <div className="font-semibold text-slate-700">{inv.supplier_name}</div>
                            {inv.category && (
                              <div className="text-[10px] text-slate-400">{inv.category}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            <div className="flex items-center gap-1">
                              <Calendar size={11} />
                              {new Date(inv.issue_date).toLocaleDateString()}
                            </div>
                            {inv.due_date && (
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                → {new Date(inv.due_date).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-end font-bold text-slate-700" dir="ltr">
                            {Number(inv.amount_ttc).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SUPPLIER_STATUS_COLORS[inv.status] ?? "bg-slate-100"}`}>
                              {t(`accounting.status_${inv.status}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingSupplier(inv);
                                  setShowSupplierModal(true);
                                }}
                                className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                                title={t("common.edit")}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => void handleDeleteSupplier(inv)}
                                className="rounded p-1.5 text-red-500 hover:bg-red-50"
                                title={t("common.delete")}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* REPORTS */}
          {activeTab === "reports" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <TrendingUp size={15} className="text-green-600" />
                  {t("accounting.reportsClientsTitle")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("accounting.reportsTotalIssued")}</span>
                    <span className="font-bold text-slate-800" dir="ltr">
                      {filteredClientInvoices.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("accounting.reportsTotalPaid")}</span>
                    <span className="font-bold text-green-700" dir="ltr">
                      {filteredClientInvoices.filter((i) => i.status === "paid").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("accounting.reportsOverdue")}</span>
                    <span className="font-bold text-red-700" dir="ltr">
                      {kpis.overdueInvoices}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <TrendingDown size={15} className="text-red-600" />
                  {t("accounting.reportsSuppliersTitle")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("accounting.reportsTotalSuppliers")}</span>
                    <span className="font-bold text-slate-800" dir="ltr">
                      {filteredSupplierInvoices.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("accounting.reportsPaid")}</span>
                    <span className="font-bold text-green-700" dir="ltr">
                      {filteredSupplierInvoices.filter((i) => i.status === "payee").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("accounting.reportsOverdue")}</span>
                    <span className="font-bold text-red-700" dir="ltr">
                      {kpis.overdueSuppliers}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 md:col-span-2">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Clock size={15} className="text-amber-600" />
                  {t("accounting.reportsCashTitle")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">{t("accounting.reportsCashIn")}</div>
                    <div className="mt-1 text-lg font-extrabold text-green-700" dir="ltr">
                      +{kpis.revenuePaid.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{t("accounting.reportsCashOut")}</div>
                    <div className="mt-1 text-lg font-extrabold text-red-700" dir="ltr">
                      -{kpis.expensesPaid.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-slate-700">{t("accounting.reportsCashNet")}</span>
                    <span
                      className={`font-extrabold ${kpis.revenuePaid - kpis.expensesPaid >= 0 ? "text-green-700" : "text-red-700"}`}
                      dir="ltr"
                    >
                      {(kpis.revenuePaid - kpis.expensesPaid).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Supplier Invoice */}
      {showSupplierModal && (
        <SupplierInvoiceModal
          invoice={editingSupplier}
          onClose={() => {
            setShowSupplierModal(false);
            setEditingSupplier(null);
          }}
          onSave={handleSaveSupplier}
        />
      )}
    </div>
  );
}