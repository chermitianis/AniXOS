import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, TrendingDown, AlertTriangle, FileText } from "lucide-react";
import { fetchInvoices, fetchQuotes, documentTotal, type InvoiceRow, type QuoteRow } from "../api/accountingApi";

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof TrendingUp; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl font-extrabold text-slate-800" dir="ltr">{value}</p>
    </div>
  );
}

const fmt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function AccountingPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [inv, qt] = await Promise.all([fetchInvoices(), fetchQuotes()]);
      setInvoices(inv);
      setQuotes(qt);
      setIsLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    let issued = 0;
    let paid = 0;
    let overdue = 0;
    for (const inv of invoices) {
      const total = documentTotal(inv.invoice_items);
      issued += total;
      if (inv.status === "paid") paid += total;
      if (inv.status === "overdue") overdue += total;
    }
    const accepted = quotes.filter((q) => q.status === "accepted").length;
    return { issued, paid, overdue, quotesTotal: quotes.length, accepted };
  }, [invoices, quotes]);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-400">{t("setup.loadingSimple")}</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-400">{t("comptabilite.subtitle")}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={TrendingUp} label={t("comptabilite.revenueIssued")} value={fmt(stats.issued)} tone="bg-indigo-50 text-indigo-600" />
        <StatCard icon={TrendingDown} label={t("comptabilite.revenuePaid")} value={fmt(stats.paid)} tone="bg-emerald-50 text-emerald-600" />
        <StatCard icon={AlertTriangle} label={t("comptabilite.revenueOverdue")} value={fmt(stats.overdue)} tone="bg-red-50 text-red-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <FileText size={16} className="text-indigo-500" /> {t("comptabilite.recentInvoices")}
          </h3>
          <div className="flex flex-col gap-1.5">
            {invoices.slice(0, 10).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-400">{inv.clients?.name ?? "—"}</p>
                </div>
                <div className="text-end">
                  <p className="font-semibold text-slate-700" dir="ltr">{fmt(documentTotal(inv.invoice_items))}</p>
                  <p className="text-xs text-slate-400">{t(`comptabilite.status_${inv.status}`)}</p>
                </div>
              </div>
            ))}
            {invoices.length === 0 && <p className="py-4 text-center text-sm text-slate-300">{t("comptabilite.noInvoices")}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
            <FileText size={16} className="text-indigo-500" /> {t("comptabilite.recentQuotes")}
          </h3>
          <div className="flex flex-col gap-1.5">
            {quotes.slice(0, 10).map((q) => (
              <div key={q.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{q.quote_number}</p>
                  <p className="text-xs text-slate-400">{q.clients?.name ?? "—"}</p>
                </div>
                <div className="text-end">
                  <p className="font-semibold text-slate-700" dir="ltr">{fmt(documentTotal(q.quote_items))}</p>
                  <p className="text-xs text-slate-400">{t(`comptabilite.status_${q.status}`)}</p>
                </div>
              </div>
            ))}
            {quotes.length === 0 && <p className="py-4 text-center text-sm text-slate-300">{t("comptabilite.noQuotes")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
