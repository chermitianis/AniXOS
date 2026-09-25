import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, Activity, AlertTriangle, PackageX, LockOpen, XCircle } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { fetchOpenShifts, type OpenShiftRow } from "../api/shiftAdminApi";
import { ForceCloseShiftModal } from "../components/ForceCloseShiftModal";
import type { ProjectProfitability, InventoryItem } from "../../../shared/types/database";

interface LiveOperationRow {
  worker_id: string;
  worker_name: string;
  session_id: string;
  session_type: "production" | "downtime" | null;
  started_at: string;
  machine_id: string | null;
  machine_name: string | null;
  project_id: string | null;
  project_name: string | null;
  piece_task_id: string | null;
  piece_name: string | null;
  task_type_name: string | null;
  stop_reason_name: string | null;
}

const RISK_LABEL_KEYS: Record<string, { key: string; className: string }> = {
  on_track: { key: "setup.riskOnTrack", className: "bg-green-100 text-green-700" },
  at_risk: { key: "setup.riskAtRisk", className: "bg-amber-100 text-amber-700" },
  delayed: { key: "setup.riskDelayed", className: "bg-red-100 text-red-700" },
  completed: { key: "setup.riskCompleted", className: "bg-slate-200 text-slate-600" },
};

const DEFAULT_RISK = { key: "setup.riskOnTrack", className: "bg-green-100 text-green-700" };

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function elapsedSecondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

export function ManagerDashboardPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [profitability, setProfitability] = useState<ProjectProfitability[]>([]);
  const [liveOps, setLiveOps] = useState<LiveOperationRow[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [openShifts, setOpenShifts] = useState<OpenShiftRow[]>([]);
  const [shiftToForceClose, setShiftToForceClose] = useState<OpenShiftRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    const [{ data: profit }, { data: live }, { data: stock }, shifts] = await Promise.all([
      supabase.from("v_project_profitability").select("*").order("net_profit", { ascending: true }),
      // NB : la vue v_live_operations n'a jamais eu de colonne "shift_started_at"
      // (seulement "started_at" au niveau de la session) — ce order() échouait
      // silencieusement à chaque chargement (erreur PostgREST avalée par le
      // destructuring ci-dessous), corrigé au passage.
      supabase.from("v_live_operations").select("*").order("started_at", { ascending: false }),
      supabase.from("v_inventory_low_stock").select("*"),
      fetchOpenShifts(),
    ]);

    setProfitability((profit as ProjectProfitability[]) ?? []);
    setLiveOps((live as LiveOperationRow[]) ?? []);
    setLowStock((stock as InventoryItem[]) ?? []);
    setOpenShifts(shifts);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
    const interval = setInterval(loadDashboard, 15_000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`live-ops-${staffUser.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_sessions", filter: `company_id=eq.${staffUser.company_id}` },
        () => void loadDashboard()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_shifts", filter: `company_id=eq.${staffUser.company_id}` },
        () => void loadDashboard()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, loadDashboard]);

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">{t("setup.loadingDashboard")}</div>;
  }

  const totalNetProfit = profitability.reduce((sum, p) => sum + (p.net_profit ?? 0), 0);
  const atRiskCount = profitability.filter((p) => p.risk_status === "at_risk" || p.risk_status === "delayed").length;

  const statCards = [
    { label: t("setup.totalNetProfit"), value: totalNetProfit.toFixed(0), icon: TrendingUp, from: "from-emerald-500", to: "to-green-600", text: "text-emerald-600", ltr: true },
    { label: t("setup.liveOperations"), value: String(liveOps.length), icon: Activity, from: "from-indigo-500", to: "to-blue-600", text: "text-indigo-600", ltr: false },
    { label: t("setup.atRiskProjects"), value: String(atRiskCount), icon: AlertTriangle, from: "from-amber-500", to: "to-orange-600", text: "text-amber-600", ltr: false },
    { label: t("setup.lowStockCount"), value: String(lowStock.length), icon: PackageX, from: "from-red-500", to: "to-rose-600", text: "text-red-600", ltr: false },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* ============================================================= */}
      {/* KPI Cards — 2 colonnes sur mobile, 4 sur desktop              */}
      {/* ============================================================= */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-4"
            >
              <div
                className={`absolute -left-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br ${card.from} ${card.to} opacity-10 sm:h-20 sm:w-20`}
              />
              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-slate-400 sm:text-xs">
                    {card.label}
                  </div>
                  <div
                    className={`mt-1 text-xl font-extrabold sm:text-2xl ${card.text}`}
                    dir={card.ltr ? "ltr" : undefined}
                  >
                    {card.value}
                  </div>
                </div>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.from} ${card.to} text-white shadow-md sm:h-9 sm:w-9`}
                >
                  <Icon size={16} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================= */}
      {/* Sessions bloquées — indépendant de "Live Operations" : montre  */}
      {/* toute shift ouverte, même sans événement production actif     */}
      {/* (cas exact d'un opérateur qui a perdu l'accès à son appareil  */}
      {/* sans avoir pu se déconnecter).                                */}
      {/* ============================================================= */}
      {openShifts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-amber-800 sm:text-lg">
            <LockOpen size={18} /> {t("setup.openShiftsTitle")} ({openShifts.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {openShifts.map((shift) => {
              const elapsedHours = elapsedSecondsSince(shift.started_at) / 3600;
              const isSuspicious = elapsedHours > 12;
              return (
                <li
                  key={shift.id}
                  className="flex flex-col gap-2 rounded-lg bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-700">{shift.worker_name}</span>
                      {isSuspicious && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          ⚠️ {t("setup.suspiciousShift")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400" dir="ltr">
                      {formatElapsed(elapsedSecondsSince(shift.started_at))} — {new Date(shift.started_at).toLocaleString()}
                    </p>
                  </div>
                  {staffUser?.is_owner && (
                    <button
                      type="button"
                      onClick={() => setShiftToForceClose(shift)}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    >
                      <XCircle size={14} /> {t("setup.forceCloseButton")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {shiftToForceClose && (
        <ForceCloseShiftModal
          shift={shiftToForceClose}
          onClose={() => setShiftToForceClose(null)}
          onClosed={() => void loadDashboard()}
        />
      )}

      {/* ============================================================= */}
      {/* Live Operations — cartes empilées sur mobile                  */}
      {/* ============================================================= */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-base font-bold text-slate-800 sm:mb-4 sm:text-lg">
          {t("setup.liveOpsTitle")}
        </h2>
        {liveOps.length === 0 ? (
          <p className="text-sm text-slate-400">{t("setup.noLiveOperations")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...liveOps]
              .sort((a, b) => {
                const rank = (r: LiveOperationRow) =>
                  r.session_type === "production" ? 0 : r.session_type === "downtime" ? 1 : 2;
                return (
                  rank(a) - rank(b) ||
                  new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
                );
              })
              .map((op) => {
                const isProduction = op.session_type === "production";
                const isDowntime = op.session_type === "downtime";
                const dotColor = isProduction ? "bg-blue-500" : isDowntime ? "bg-amber-500" : "bg-slate-300";
                const pingColor = isProduction ? "bg-blue-400" : isDowntime ? "bg-amber-400" : "";
                const currentEventLabel = isProduction
                  ? op.task_type_name ?? t("setup.inProduction")
                  : isDowntime
                    ? op.stop_reason_name ?? t("setup.inDowntime")
                    : t("setup.workerLoggedInWaiting");
                const elapsed = elapsedSecondsSince(op.started_at);

                return (
                  <li
                    key={op.session_id}
                    className="rounded-lg bg-slate-50 p-3 text-sm transition-colors hover:bg-slate-100 sm:flex sm:items-center sm:justify-between sm:px-3 sm:py-2"
                  >
                    {/* Ligne 1 : worker + status */}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        {pingColor && (
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pingColor} opacity-75`}
                          />
                        )}
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
                      </span>
                      <span className="truncate font-semibold text-slate-700">
                        {op.worker_name}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isProduction
                            ? "bg-blue-50 text-blue-600"
                            : isDowntime
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {currentEventLabel}
                      </span>
                    </div>

                    {/* Ligne 2 : machine/projet/pièce (mobile) ou inline (desktop) */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 sm:mt-0 sm:ms-3 sm:shrink">
                      {op.machine_name && <span>— {op.machine_name}</span>}
                      {op.project_name && <span>— {op.project_name}</span>}
                      {op.piece_name && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                          {op.piece_name}
                        </span>
                      )}
                    </div>

                    {/* Ligne 3 : durée */}
                    <span
                      className="mt-1.5 inline-block text-xs text-slate-400 sm:mt-0 sm:ms-3 sm:shrink-0"
                      dir="ltr"
                    >
                      {formatElapsed(elapsed)}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* ============================================================= */}
      {/* Profitability — table sur desktop, cartes sur mobile          */}
      {/* ============================================================= */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-base font-bold text-slate-800 sm:mb-4 sm:text-lg">
          {t("setup.profitabilityTable")}
        </h2>

        {/* Vue mobile : cartes empilées */}
        <div className="flex flex-col gap-2 md:hidden">
          {profitability.length === 0 ? (
            <p className="rounded-lg bg-slate-50 py-4 text-center text-sm text-slate-400">
              {t("setup.noDataYet")}
            </p>
          ) : (
            profitability.map((p) => {
              const risk = (p.risk_status && RISK_LABEL_KEYS[p.risk_status]) || DEFAULT_RISK;
              return (
                <div
                  key={p.project_id}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">
                      {p.project_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${risk.className}`}
                    >
                      {t(risk.key)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.actualHours")}
                      </div>
                      <div className="font-semibold text-slate-600" dir="ltr">
                        {(p.actual_production_hours ?? 0).toFixed(1)} {t("setup.hoursShort")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.timeVariance")}
                      </div>
                      <div className="font-semibold text-slate-600" dir="ltr">
                        {p.time_variance_percent !== null
                          ? `${p.time_variance_percent > 0 ? "+" : ""}${p.time_variance_percent}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.netProfit")}
                      </div>
                      <div
                        className={`font-bold ${
                          (p.net_profit ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                        dir="ltr"
                      >
                        {p.net_profit !== null ? p.net_profit.toFixed(0) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Vue desktop : tableau */}
        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-start">{t("setup.projectName")}</th>
                <th className="px-3 py-2.5 text-start">{t("common.active")}</th>
                <th className="px-3 py-2.5 text-left">{t("setup.actualHours")}</th>
                <th className="px-3 py-2.5 text-left">{t("setup.timeVariance")}</th>
                <th className="px-3 py-2.5 text-left">{t("setup.netProfit")}</th>
              </tr>
            </thead>
            <tbody>
              {profitability.map((p) => {
                const risk = (p.risk_status && RISK_LABEL_KEYS[p.risk_status]) || DEFAULT_RISK;
                return (
                  <tr
                    key={p.project_id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5 text-start font-semibold text-slate-700">
                      {p.project_name}
                    </td>
                    <td className="px-3 py-2.5 text-start">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${risk.className}`}
                      >
                        {t(risk.key)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                      {(p.actual_production_hours ?? 0).toFixed(1)} {t("setup.hoursShort")}
                    </td>
                    <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                      {p.time_variance_percent !== null
                        ? `${p.time_variance_percent > 0 ? "+" : ""}${p.time_variance_percent}%`
                        : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-left font-bold ${
                        (p.net_profit ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                      dir="ltr"
                    >
                      {p.net_profit !== null ? p.net_profit.toFixed(0) : "—"}
                    </td>
                  </tr>
                );
              })}
              {profitability.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    {t("setup.noDataYet")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================= */}
      {/* Low Stock alert                                                */}
      {/* ============================================================= */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5">
          <h2 className="mb-3 text-base font-bold text-red-700 sm:text-lg">
            {t("setup.reorderAlert")}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {lowStock.map((item) => (
              <li key={item.id} className="text-sm text-red-600">
                <span className="font-semibold">{item.name}</span>: {item.quantity_on_hand}{" "}
                {item.unit} {t("setup.minOnly")} ({t("setup.minThreshold")}:{" "}
                {item.reorder_threshold})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}