import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Wallet, TrendingUp, FileText, AlertCircle } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import { toISO, type DateRange } from "../types";

interface FinanceReportTabProps {
  dateRange: DateRange;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  issued_date: string | null;
  due_date: string | null;
  client_id: string;
  project_id: string | null;
  clients: { name: string } | { name: string }[] | null;
  invoice_items: { quantity: number; unit_price: number; description: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  issued: "#3b82f6",
  paid: "#10b981",
  overdue: "#ef4444",
  cancelled: "#cbd5e1",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "reports.invoiceStatusDraft",
  issued: "reports.invoiceStatusIssued",
  paid: "reports.invoiceStatusPaid",
  overdue: "reports.invoiceStatusOverdue",
  cancelled: "reports.invoiceStatusCancelled",
};

function clientName(c: InvoiceRow["clients"]): string {
  if (!c) return "—";
  if (Array.isArray(c)) return c[0]?.name ?? "—";
  return c.name ?? "—";
}

export function FinanceReportTab({ dateRange }: FinanceReportTabProps) {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const fromISO = toISO(dateRange.from).slice(0, 10);
      const toISOStr = toISO(dateRange.to).slice(0, 10);

      const { data } = await supabase
        .from("invoices")
        .select(`
          id, invoice_number, status, issued_date, due_date, client_id, project_id,
          clients(name),
          invoice_items(quantity, unit_price, description)
        `)
        .gte("issued_date", fromISO)
        .lte("issued_date", toISOStr)
        .order("issued_date", { ascending: false });

      if (isMounted) {
        setInvoices((data as unknown as InvoiceRow[]) ?? []);
        setIsLoading(false);
      }
    }
    void load();
    return () => { isMounted = false; };
  }, [dateRange.from, dateRange.to]);

  const invoiceTotal = (inv: InvoiceRow) =>
    (inv.invoice_items ?? []).reduce((s, i) => s + (i.quantity ?? 0) * (i.unit_price ?? 0), 0);

  const kpis = useMemo(() => {
    const total = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
    const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + invoiceTotal(i), 0);
    const pending = invoices.filter((i) => i.status === "issued").reduce((s, i) => s + invoiceTotal(i), 0);
    const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + invoiceTotal(i), 0);
    return { total, paid, pending, overdue, count: invoices.length };
  }, [invoices]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; paid: number; pending: number }>();
    for (const inv of invoices) {
      if (!inv.issued_date) continue;
      const month = inv.issued_date.slice(0, 7);
      const entry = map.get(month) ?? { month, paid: 0, pending: 0 };
      const total = invoiceTotal(inv);
      if (inv.status === "paid") entry.paid += total;
      if (inv.status === "issued" || inv.status === "overdue") entry.pending += total;
      map.set(month, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((d) => ({
        month: d.month.slice(5) + "/" + d.month.slice(2, 4),
        paid: Number(d.paid.toFixed(0)),
        pending: Number(d.pending.toFixed(0)),
      }));
  }, [invoices]);

  const statusPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      const current = map.get(inv.status) ?? 0;
      map.set(inv.status, current + invoiceTotal(inv));
    }
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({
        name: t(STATUS_LABEL_KEYS[status] ?? status),
        value: Number(value.toFixed(0)),
        color: STATUS_COLORS[status] ?? "#94a3b8",
      }));
  }, [invoices, t]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          iconBg="bg-indigo-100 text-indigo-600"
          label={t("reports.kpi.revenue")}
          value={kpis.total.toFixed(0)}
          subtitle={t("reports.currencyTND")}
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-emerald-100 text-emerald-600"
          label={t("reports.invoiceStatusPaid")}
          value={kpis.paid.toFixed(0)}
          subtitle={t("reports.currencyTND")}
        />
        <KpiCard
          icon={FileText}
          iconBg="bg-blue-100 text-blue-600"
          label={t("reports.invoiceStatusIssued")}
          value={kpis.pending.toFixed(0)}
          subtitle={t("reports.currencyTND")}
        />
        <KpiCard
          icon={AlertCircle}
          iconBg="bg-red-100 text-red-600"
          label={t("reports.invoiceStatusOverdue")}
          value={kpis.overdue.toFixed(0)}
          subtitle={t("reports.currencyTND")}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title={t("reports.charts.revenueVsCosts")}>
            {monthlyData.length === 0 ? (
              <EmptyState icon={Wallet} message={t("reports.noData")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    formatter={(v: number) => `${v.toFixed(0)} ${t("reports.currencyTND")}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="paid" fill="#10b981" name={t("reports.invoiceStatusPaid")} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" fill="#3b82f6" name={t("reports.invoiceStatusIssued")} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard title={t("reports.charts.projectsStatus")}>
          {statusPie.length === 0 ? (
            <EmptyState icon={Wallet} message={t("reports.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {statusPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(v: number) => `${v.toFixed(0)} ${t("reports.currencyTND")}`}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Tableau / Liste des factures */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700 sm:mb-4">
          {t("reports.tabs.finance")} ({invoices.length})
        </h3>

        {invoices.length === 0 ? (
          <EmptyState icon={Wallet} message={t("reports.noData")} hint={t("reports.financeHint")} />
        ) : (
          <>
            {/* Vue mobile : cartes */}
            <div className="flex flex-col gap-2 md:hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-slate-500" dir="ltr">
                        {inv.invoice_number}
                      </div>
                      <div className="truncate text-sm font-bold text-slate-700">
                        {clientName(inv.clients)}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: STATUS_COLORS[inv.status] ?? "#94a3b8" }}
                    >
                      {t(STATUS_LABEL_KEYS[inv.status] ?? inv.status)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.date")}
                      </div>
                      <div className="font-semibold text-slate-600" dir="ltr">
                        {inv.issued_date ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.dueDate")}
                      </div>
                      <div className="font-semibold text-slate-600" dir="ltr">
                        {inv.due_date ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[10px] uppercase text-slate-400">
                      {t("setup.totalLabel")}
                    </span>
                    <span className="text-sm font-extrabold text-slate-800" dir="ltr">
                      {invoiceTotal(inv).toFixed(0)} {t("reports.currencyTND")}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Vue desktop : tableau */}
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-start">{t("setup.invoiceNumber")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.client")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.date")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.dueDate")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.totalLabel")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-start font-semibold text-slate-700" dir="ltr">{inv.invoice_number}</td>
                      <td className="px-3 py-2.5 text-start text-slate-600">{clientName(inv.clients)}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{inv.issued_date ?? "—"}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{inv.due_date ?? "—"}</td>
                      <td className="px-3 py-2.5 text-left font-bold text-slate-700" dir="ltr">{invoiceTotal(inv).toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-start">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: STATUS_COLORS[inv.status] ?? "#94a3b8" }}
                        >
                          {t(STATUS_LABEL_KEYS[inv.status] ?? inv.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}