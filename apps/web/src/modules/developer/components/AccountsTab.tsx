import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Users, CheckCircle2, Clock, Ban, Filter, Eye, Database,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { AccountDetailsModal } from "./AccountDetailsModal";

interface AccountRow {
  id: string;
  email: string;
  owner_full_name: string;
  phone: string | null;
  subscription_status: string;
  plan: string;
  is_developer: boolean;
  trial_ends_at: string;
  current_period_end: string | null;
  max_databases: number;
  suspended_by_admin: boolean;
  created_at: string;
  databases_count?: number;
}

interface AccountsTabProps {
  /** Callback appelé après chaque action de gestion (via Modal).
   *  Permet au parent (DeveloperPanelPage) de rafraîchir les autres onglets. */
  onChanged?: () => void;
}

const PLAN_COLORS: Record<string, string> = {
  trial: "bg-slate-100 text-slate-700",
  standard: "bg-indigo-100 text-indigo-700",
  premium: "bg-amber-100 text-amber-800",
};

const STATUS_COLORS: Record<string, string> = {
  trial: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-500",
};

export function AccountsTab({ onChanged }: AccountsTabProps) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // 1) Charger tous les accounts
    const { data: accountsData, error: accountsError } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (accountsError) {
      console.error("[AccountsTab]", accountsError);
      setError(accountsError.message);
      setIsLoading(false);
      return;
    }

    // 2) Compter les databases par account
    const { data: dbData } = await supabase
      .from("databases")
      .select("account_id");

    const countByAccount = new Map<string, number>();
    for (const row of (dbData ?? []) as { account_id: string }[]) {
      countByAccount.set(row.account_id, (countByAccount.get(row.account_id) ?? 0) + 1);
    }

    const merged: AccountRow[] = ((accountsData ?? []) as AccountRow[]).map((a) => ({
      ...a,
      databases_count: countByAccount.get(a.id) ?? 0,
    }));

    setAccounts(merged);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Recharge les données locales + signale le parent que quelque chose a changé. */
  const handleModalChanged = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  // KPIs
  const kpis = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.subscription_status === "active").length;
    const trial = accounts.filter((a) => a.subscription_status === "trial").length;
    const suspended = accounts.filter(
      (a) => a.subscription_status === "suspended" || a.subscription_status === "cancelled"
    ).length;
    return { total, active, trial, suspended };
  }, [accounts]);

  // Filtrage
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (q && !a.email.toLowerCase().includes(q) && !a.owner_full_name.toLowerCase().includes(q)) {
        return false;
      }
      if (planFilter && a.plan !== planFilter) return false;
      if (statusFilter && a.subscription_status !== statusFilter) return false;
      return true;
    });
  }, [accounts, search, planFilter, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        <span className="ms-2">{t("common.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          icon={Users}
          bg="bg-indigo-100 text-indigo-600"
          label={t("developer.accounts.kpi.total")}
          value={kpis.total}
        />
        <KpiBox
          icon={CheckCircle2}
          bg="bg-emerald-100 text-emerald-600"
          label={t("developer.accounts.kpi.active")}
          value={kpis.active}
        />
        <KpiBox
          icon={Clock}
          bg="bg-blue-100 text-blue-600"
          label={t("developer.accounts.kpi.trial")}
          value={kpis.trial}
        />
        <KpiBox
          icon={Ban}
          bg="bg-red-100 text-red-600"
          label={t("developer.accounts.kpi.suspended")}
          value={kpis.suspended}
        />
      </div>

      {/* Filtres */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("developer.accounts.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1.5">
            <Filter size={14} className="text-slate-400" />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="border-0 bg-transparent text-sm text-slate-700 focus:outline-none"
            >
              <option value="">{t("developer.accounts.allPlans")}</option>
              <option value="trial">{t("subscription.planTrial")}</option>
              <option value="standard">{t("subscription.planStandard")}</option>
              <option value="premium">{t("subscription.planPremium")}</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
          >
            <option value="">{t("developer.accounts.allStatuses")}</option>
            <option value="trial">{t("developer.accounts.statusTrial")}</option>
            <option value="active">{t("developer.accounts.statusActive")}</option>
            <option value="expired">{t("developer.accounts.statusExpired")}</option>
            <option value="suspended">{t("developer.accounts.statusSuspended")}</option>
            <option value="cancelled">{t("developer.accounts.statusCancelled")}</option>
          </select>
        </div>
      </div>

      {/* Tableau */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-700">
            {t("developer.accounts.title")} ({filtered.length} / {accounts.length})
          </h3>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {t("developer.accounts.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 text-start">{t("developer.accounts.colOwner")}</th>
                  <th className="px-4 py-2.5 text-start">{t("developer.accounts.colPlan")}</th>
                  <th className="px-4 py-2.5 text-start">{t("developer.accounts.colStatus")}</th>
                  <th className="px-4 py-2.5 text-left">{t("developer.accounts.colDatabases")}</th>
                  <th className="px-4 py-2.5 text-left">{t("developer.accounts.colCreated")}</th>
                  <th className="px-4 py-2.5 text-end"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold text-slate-700">{a.owner_full_name}</div>
                          <div className="text-xs text-slate-400" dir="ltr">{a.email}</div>
                        </div>
                        {a.is_developer && (
                          <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-400">
                            DEV
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_COLORS[a.plan] ?? "bg-slate-100 text-slate-500"}`}>
                        {a.plan === "trial"
                          ? t("subscription.planTrial")
                          : a.plan === "standard"
                            ? t("subscription.planStandard")
                            : t("subscription.planPremium")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[a.subscription_status] ?? "bg-slate-100 text-slate-500"}`}>
                        {t(`developer.accounts.status_${a.subscription_status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left text-slate-600" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        <Database size={12} className="text-slate-400" />
                        {a.databases_count ?? 0} / {a.max_databases}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left text-xs text-slate-500" dir="ltr">
                      {new Date(a.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={() => setOpenAccountId(a.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        <Eye size={12} />
                        {t("developer.accounts.viewDetails")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {openAccountId && (
        <AccountDetailsModal
          accountId={openAccountId}
          onClose={() => setOpenAccountId(null)}
          onChanged={() => void handleModalChanged()}
        />
      )}
    </div>
  );
}

/* ---------- Helper KPI Box ---------- */
function KpiBox({
  icon: Icon,
  bg,
  label,
  value,
}: {
  icon: typeof Users;
  bg: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon size={18} />
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold text-slate-800" dir="ltr">
        {value}
      </div>
    </div>
  );
}
