import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Users, CheckCircle2, Clock, DollarSign, Activity } from "lucide-react";
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

const PLAN_COLORS = ["#6366f1", "#f59e0b", "#64748b"];
const PLAN_LABELS_KEYS: Record<string, string> = {
  trial: "subscription.planTrial",
  standard: "subscription.planStandard",
  premium: "subscription.planPremium",
};

export function OverviewTab() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [settings, setSettings] = useState<{ currency: string; standard_monthly_price: number; premium_monthly_price: number } | null>(null);
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
        const s = settingsRes.data[0] as { currency: string; standard_monthly_price: number; premium_monthly_price: number };
        setSettings(s);
      }
      setIsLoading(false);
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.subscription_status === "active" && !a.is_developer).length;
    const trial = accounts.filter((a) => a.subscription_status === "trial").length;

    // MRR = Σ(prix mensuel des comptes actifs)
    let mrr = 0;
    if (settings) {
      for (const a of accounts) {
        if (a.subscription_status !== "active" || a.is_developer) continue;
        if (a.plan === "standard") mrr += settings.standard_monthly_price;
        if (a.plan === "premium") mrr += settings.premium_monthly_price;
      }
    }
    return { total, active, trial, mrr };
  }, [accounts, settings]);

  // Chart 1: التسجيلات الشهرية (آخر 6 أشهر)
  const signupsChart = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      months.push({ key, label, count: 0 });
    }
    for (const a of accounts) {
      const monthKey = a.created_at.slice(0, 7);
      const found = months.find((m) => m.key === monthKey);
      if (found) found.count += 1;
    }
    return months;
  }, [accounts]);

  // Chart 2: توزيع الخطط
  const plansPie = useMemo(() => {
    const counts: Record<string, number> = { trial: 0, standard: 0, premium: 0 };
    for (const a of accounts) {
      if (counts[a.plan] !== undefined) counts[a.plan] += 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([plan, count], i) => ({
        name: t(PLAN_LABELS_KEYS[plan] ?? plan),
        value: count,
        color: PLAN_COLORS[i % PLAN_COLORS.length],
      }));
  }, [accounts, t]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          icon={Users}
          bg="bg-indigo-100 text-indigo-600"
          label={t("developer.overview.kpi.totalAccounts")}
          value={kpis.total}
        />
        <KpiBox
          icon={CheckCircle2}
          bg="bg-emerald-100 text-emerald-600"
          label={t("developer.overview.kpi.activeAccounts")}
          value={kpis.active}
        />
        <KpiBox
          icon={Clock}
          bg="bg-blue-100 text-blue-600"
          label={t("developer.overview.kpi.trialAccounts")}
          value={kpis.trial}
        />
        <KpiBox
          icon={DollarSign}
          bg="bg-violet-100 text-violet-600"
          label={t("developer.overview.kpi.mrr")}
          value={`${kpis.mrr.toFixed(0)} ${settings?.currency ?? ""}`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartBox title={t("developer.overview.charts.signupsPerMonth")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupsChart}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name={t("developer.overview.kpi.totalAccounts")} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>

        <ChartBox title={t("developer.overview.charts.plansDistribution")}>
          {plansPie.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {t("developer.overview.noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={plansPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {plansPie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartBox>
      </div>

      {/* Note */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <Activity className="mb-1 inline-block text-slate-400" size={14} /> {t("developer.overview.note")}
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
      <div className="mt-1 text-2xl font-extrabold text-slate-800" dir="ltr">{value}</div>
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-700">{title}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}