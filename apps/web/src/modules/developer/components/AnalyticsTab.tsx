import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, DollarSign, Users, AlertTriangle } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface AccountRow {
  id: string;
  email: string;
  owner_full_name: string;
  plan: string;
  subscription_status: string;
  is_developer: boolean;
  created_at: string;
}

interface PlatformSettings {
  currency: string;
  standard_monthly_price: number;
  standard_yearly_price: number;
  premium_monthly_price: number;
  premium_yearly_price: number;
}

export function AnalyticsTab() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);

      const [accountsRes, settingsRes] = await Promise.all([
        supabase.from("accounts").select("id, email, owner_full_name, plan, subscription_status, is_developer, created_at"),
        supabase.rpc("get_platform_settings"),
      ]);

      if (!isMounted) return;

      setAccounts((accountsRes.data as AccountRow[] | null) ?? []);
      if (settingsRes.data && settingsRes.data.length > 0) {
        setSettings(settingsRes.data[0] as PlatformSettings);
      }
      setIsLoading(false);
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  // MRR / ARR
  const financials = useMemo(() => {
    if (!settings) return { mrr: 0, arr: 0, arpu: 0 };
    let mrr = 0;
    let activePaid = 0;
    for (const a of accounts) {
      if (a.subscription_status !== "active" || a.is_developer) continue;
      if (a.plan === "standard") mrr += settings.standard_monthly_price;
      if (a.plan === "premium") mrr += settings.premium_monthly_price;
      activePaid += 1;
    }
    const arr = mrr * 12;
    const arpu = activePaid > 0 ? mrr / activePaid : 0;
    return { mrr, arr, arpu };
  }, [accounts, settings]);

  // Conversion rate: (active paid) / (total non-developer accounts)
  const conversionRate = useMemo(() => {
    const nonDev = accounts.filter((a) => !a.is_developer);
    if (nonDev.length === 0) return 0;
    const active = nonDev.filter((a) => a.subscription_status === "active").length;
    return (active / nonDev.length) * 100;
  }, [accounts]);

  // Churn: (expired + cancelled) / (total non-developer)
  const churnRate = useMemo(() => {
    const nonDev = accounts.filter((a) => !a.is_developer);
    if (nonDev.length === 0) return 0;
    const lost = nonDev.filter(
      (a) => a.subscription_status === "expired" || a.subscription_status === "cancelled"
    ).length;
    return (lost / nonDev.length) * 100;
  }, [accounts]);

  // MRR chart: 6 derniers mois (approximation basée sur les créations actives)
  const mrrChart = useMemo(() => {
    if (!settings) return [];
    const now = new Date();
    const months: { key: string; label: string; mrr: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      months.push({ key, label, mrr: 0 });
    }
    // Pour chaque mois, on calcule le MRR des comptes créés avant/à ce mois et encore actifs
    for (const m of months) {
      let total = 0;
      for (const a of accounts) {
        if (a.subscription_status !== "active" || a.is_developer) continue;
        if (a.created_at.slice(0, 7) > m.key) continue;
        if (a.plan === "standard") total += settings.standard_monthly_price;
        if (a.plan === "premium") total += settings.premium_monthly_price;
      }
      m.mrr = Number(total.toFixed(2));
    }
    return months;
  }, [accounts, settings]);

  // Top customers (10 plus gros)
  const topCustomers = useMemo(() => {
    if (!settings) return [];
    return accounts
      .filter((a) => a.subscription_status === "active" && !a.is_developer)
      .map((a) => {
        const price =
          a.plan === "premium"
            ? settings.premium_monthly_price
            : a.plan === "standard"
              ? settings.standard_monthly_price
              : 0;
        return { ...a, price };
      })
      .sort((a, b) => b.price - a.price)
      .slice(0, 10);
  }, [accounts, settings]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  const currency = settings?.currency ?? "";

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          icon={DollarSign}
          bg="bg-emerald-100 text-emerald-600"
          label={t("developer.analytics.kpi.mrr")}
          value={`${financials.mrr.toFixed(0)} ${currency}`}
        />
        <KpiBox
          icon={TrendingUp}
          bg="bg-indigo-100 text-indigo-600"
          label={t("developer.analytics.kpi.arr")}
          value={`${financials.arr.toFixed(0)} ${currency}`}
        />
        <KpiBox
          icon={Users}
          bg="bg-violet-100 text-violet-600"
          label={t("developer.analytics.kpi.arpu")}
          value={`${financials.arpu.toFixed(2)} ${currency}`}
        />
        <KpiBox
          icon={AlertTriangle}
          bg="bg-red-100 text-red-600"
          label={t("developer.analytics.kpi.churn")}
          value={`${churnRate.toFixed(1)}%`}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MiniKpi
          label={t("developer.analytics.kpi.conversionRate")}
          value={`${conversionRate.toFixed(1)}%`}
        />
        <MiniKpi
          label={t("developer.analytics.kpi.totalNonDevAccounts")}
          value={accounts.filter((a) => !a.is_developer).length.toString()}
        />
        <MiniKpi
          label={t("developer.analytics.kpi.activePaidAccounts")}
          value={accounts.filter((a) => a.subscription_status === "active" && !a.is_developer).length.toString()}
        />
      </div>

      {/* MRR chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-700">
          {t("developer.analytics.charts.mrrOverTime")}
        </h3>
        <div className="h-64">
          {mrrChart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {t("developer.overview.noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mrrChart}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(v: number) => `${v.toFixed(2)} ${currency}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="mrr" fill="#10b981" name={t("developer.analytics.kpi.mrr")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top customers */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-700">
            {t("developer.analytics.tables.topCustomers")}
          </h3>
        </div>
        {topCustomers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {t("developer.analytics.noPaidCustomers")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 text-start">{t("developer.accounts.colOwner")}</th>
                <th className="px-5 py-2.5 text-start">{t("developer.accounts.colPlan")}</th>
                <th className="px-5 py-2.5 text-left">{t("developer.analytics.colMonthlyValue")}</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-700">{c.owner_full_name}</div>
                    <div className="text-xs text-slate-400" dir="ltr">{c.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {c.plan === "standard" ? t("subscription.planStandard") : t("subscription.planPremium")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-left font-bold text-slate-700" dir="ltr">
                    {c.price.toFixed(2)} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function KpiBox({
  icon: Icon,
  bg,
  label,
  value,
}: {
  icon: typeof Users;
  bg: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon size={18} />
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-slate-800" dir="ltr">{value}</div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-slate-800" dir="ltr">{value}</div>
    </div>
  );
}