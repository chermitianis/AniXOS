import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Factory,
  LogOut,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { AppLogo } from "../../../shared/components/AppLogo";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
import { usePlanningSession } from "../context/PlanningSessionContext";
import { fetchPlanningForDate, type PlanningRow } from "../api/workerPlanningApi";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

/** Écran principal de la PWA Planning opérateur — lecture seule stricte du
 * planning machines, identique à ce que le Kiosk affiche derrière son
 * bouton "Planning machines". Aucune écriture, aucune session de production,
 * aucun lien avec les rapports/statistiques de l'entreprise. */
export function WorkerPlanningHomePage() {
  const { t, i18n } = useTranslation();
  const { session, logout } = usePlanningSession();

  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = useCallback(
    async (date: string, { silent }: { silent?: boolean } = {}) => {
      if (!session) return;
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);

      const result = await fetchPlanningForDate(session, date);
      setRows(result.rows);
      setFetchedAt(result.fetchedAt);
      setIsFromCache(result.fromCache);
      setErrorCode(result.error ?? null);
      setSelectedMachineId((current) =>
        current && result.rows.some((r) => r.machine_id === current) ? current : (result.rows[0]?.machine_id ?? null)
      );

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [session]
  );

  useEffect(() => {
    void load(selectedDate);
  }, [selectedDate, load]);

  const machines = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.machine_id, r.machine_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const selectedRows = rows.filter((r) => r.machine_id === selectedMachineId);

  const today = toDateStr(new Date());
  const dateLabel =
    selectedDate === today
      ? t("kiosk.today")
      : selectedDate === addDays(today, -1)
        ? t("kiosk.yesterday")
        : selectedDate === addDays(today, 1)
          ? t("kiosk.tomorrow")
          : new Date(selectedDate + "T00:00:00").toLocaleDateString(i18n.language, {
              weekday: "long",
              day: "2-digit",
              month: "long",
            });

  if (!session) return null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* En-tête */}
      <div className="flex flex-col gap-3 bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <AppLogo size="sm" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">
              {t("workerPlanning.appTitle")}
            </p>
            <p className="text-sm font-bold leading-tight">{session.companyName}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => void load(selectedDate, { silent: true })}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25 disabled:opacity-60"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
            {t("workerPlanning.refreshButton")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/20"
            title={t("workerPlanning.logoutButton")}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Statut de synchronisation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-400">
        <span>
          {fetchedAt
            ? t("workerPlanning.lastUpdated", { time: new Date(fetchedAt).toLocaleTimeString(i18n.language) })
            : t("workerPlanning.neverUpdated")}
        </span>
        {isFromCache && (
          <span className="flex items-center gap-1 font-semibold text-amber-600">
            <WifiOff size={13} /> {t("workerPlanning.offlineNotice")}
          </span>
        )}
      </div>

      {errorCode && !isFromCache && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorCode === "subscription_required"
            ? t("workerPlanning.subscriptionRequired")
            : errorCode === "invalid_token"
              ? t("workerPlanning.sessionRevoked")
              : t("workerPlanning.networkError")}
        </div>
      )}

      {/* Navigation par date */}
      <div className="flex items-center justify-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          className="rounded-lg bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
          <CalendarDays size={15} className="text-indigo-500" />
          <span>{dateLabel}</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="ms-1 rounded bg-transparent text-xs text-slate-500 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          className="rounded-lg bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">{t("setup.loadingSimple")}</div>
      ) : machines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-400">
          {t("kiosk.noPlanningYet")}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden px-4 pb-4 sm:flex-row sm:gap-4">
          <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-2 sm:w-48 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:pb-0">
            {machines.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMachineId(m.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-start text-sm font-semibold shadow-sm transition-colors sm:w-full ${
                  selectedMachineId === m.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl bg-white p-3 shadow-sm sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
              <Factory size={17} className="text-indigo-500" />
              {machines.find((m) => m.id === selectedMachineId)?.name}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-start">{t("setup.workerCol")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.projectCol")}</th>
                    <th className="px-3 py-2.5 text-start">{t("kiosk.pieceRefCol")}</th>
                    <th className="px-3 py-2.5 text-left">{t("kiosk.quantityCol")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.client")}</th>
                    <th className="px-3 py-2.5 text-start">{t("kiosk.materialCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((r) => (
                    <tr key={r.planning_id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 text-start font-semibold text-indigo-700">{r.worker_name}</td>
                      <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{r.project_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{r.piece_ref ?? "—"}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {r.quantity ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{r.client_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{r.material ?? "—"}</td>
                    </tr>
                  ))}
                  {selectedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        {t("kiosk.noPlanningForMachine")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {confirmLogout && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 text-center shadow-2xl">
            <p className="mb-4 text-sm text-slate-600">{t("workerPlanning.logoutConfirm")}</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={logout}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t("workerPlanning.logoutButton")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
