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
  Cog,
  User,
  Circle,
  Loader2,
} from "lucide-react";
import { AppLogo } from "../../../shared/components/AppLogo";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
import { usePlanningSession } from "../context/PlanningSessionContext";
import { fetchPlanningForDate } from "../api/workerPlanningApi";
import type { KioskPlanningCard } from "../../kiosk/api/kioskApi";

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toDateStr(date);
}

type WpFilter = "all" | "cnc" | "classique";

export function WorkerPlanningHomePage() {
  const { t, i18n } = useTranslation();
  const { session, logout } = usePlanningSession();

  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [cards, setCards] = useState<KioskPlanningCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [wpFilter, setWpFilter] = useState<WpFilter>("all");

  const load = useCallback(
    async (date: string, { silent }: { silent?: boolean } = {}) => {
      if (!session) return;
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);

      const result = await fetchPlanningForDate(session, date);
      setCards(result.cards);
      setFetchedAt(result.fetchedAt);
      setIsFromCache(result.fromCache);
      setErrorCode(result.error ?? null);
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [session],
  );

  useEffect(() => {
    void load(selectedDate);
  }, [selectedDate, load]);

  // Appliquer le filtre WP
  const filteredCards = useMemo(() => {
    if (wpFilter === "all") return cards;
    return cards.filter((c) => c.wp_interface === wpFilter);
  }, [cards, wpFilter]);

  // Groupement par machine → shift (cartes triées par sequence_order)
  const machinesGrouped = useMemo(() => {
    const map = new Map<
      string,
      {
        machine: { id: string; name: string };
        shifts: Map<number, KioskPlanningCard[]>;
      }
    >();

    for (const c of filteredCards) {
      if (!map.has(c.machine_id)) {
        map.set(c.machine_id, {
          machine: { id: c.machine_id, name: c.machine_name },
          shifts: new Map(),
        });
      }
      const entry = map.get(c.machine_id)!;
      const arr = entry.shifts.get(c.shift_number) ?? [];
      arr.push(c);
      entry.shifts.set(c.shift_number, arr);
    }

    // Trier les cartes par sequence_order dans chaque shift
    for (const entry of map.values()) {
      for (const [n, arr] of entry.shifts) {
        arr.sort((a, b) => a.sequence_order - b.sequence_order);
        entry.shifts.set(n, arr);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.machine.name.localeCompare(b.machine.name),
    );
  }, [filteredCards]);

  const maxShift = useMemo(() => {
    let max = 3;
    for (const entry of machinesGrouped) {
      for (const n of entry.shifts.keys()) {
        if (n > max) max = n;
      }
    }
    return max;
  }, [machinesGrouped]);

  const shiftNumbers = useMemo(
    () => Array.from({ length: maxShift }, (_, i) => i + 1),
    [maxShift],
  );

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
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--bg-app)" }}>
      {/* HEADER */}
      <div
        className="flex flex-col gap-3 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between"
        style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)" }}
      >
        <div className="flex items-center gap-2">
          <AppLogo size="sm" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">
              {t("workerPlanning.appTitle", { defaultValue: "Planning opérateur" })}
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
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/25 disabled:opacity-60"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">
              {t("workerPlanning.refreshButton", { defaultValue: "Actualiser" })}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 transition hover:bg-white/20"
            title={t("workerPlanning.logoutButton", { defaultValue: "Se déconnecter" })}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* SYNC STATUS */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-tertiary)",
        }}
      >
        <span>
          {fetchedAt
            ? t("workerPlanning.lastUpdated", {
                defaultValue: "Dernière mise à jour : {{time}}",
                time: new Date(fetchedAt).toLocaleTimeString(i18n.language),
              })
            : t("workerPlanning.neverUpdated", { defaultValue: "Pas encore synchronisé" })}
        </span>
        {isFromCache && (
          <span className="flex items-center gap-1 font-semibold text-amber-600">
            <WifiOff size={13} />
            {t("workerPlanning.offlineNotice", { defaultValue: "Hors ligne — cache" })}
          </span>
        )}
      </div>

      {/* ERROR */}
      {errorCode && !isFromCache && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorCode === "subscription_required"
            ? t("workerPlanning.subscriptionRequired", { defaultValue: "Accès indisponible." })
            : errorCode === "invalid_token"
              ? t("workerPlanning.sessionRevoked", { defaultValue: "QR invalide." })
              : t("workerPlanning.networkError", { defaultValue: "Connexion impossible." })}
        </div>
      )}

      {/* TOOLBAR */}
      <div className="flex flex-col items-center gap-3 px-4 py-3 sm:flex-row sm:justify-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="rounded-lg border p-1.5 transition"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <div
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            <CalendarDays size={15} style={{ color: "var(--brand-orange)" }} />
            <span>{dateLabel}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="ms-1 rounded bg-transparent text-xs outline-none"
              style={{ color: "var(--text-secondary)" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="rounded-lg border p-1.5 transition"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div
          className="flex gap-1 rounded-xl border p-1"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {(["all", "cnc", "classique"] as WpFilter[]).map((f) => {
            const isActive = wpFilter === f;
            const label =
              f === "all"
                ? t("production.planning.filterAllIfaces", { defaultValue: "Toutes" })
                : f === "cnc"
                  ? "CNC"
                  : t("setup.interfaceClassique", { defaultValue: "Classique" });
            return (
              <button
                key={f}
                type="button"
                onClick={() => setWpFilter(f)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold transition"
                style={
                  isActive
                    ? { backgroundColor: "var(--brand-orange)", color: "#ffffff" }
                    : { color: "var(--text-secondary)" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT */}
      {isLoading ? (
        <div
          className="flex flex-1 items-center justify-center gap-2 py-20"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Loader2 size={20} className="animate-spin" />
          {t("common.loading", { defaultValue: "Chargement..." })}
        </div>
      ) : machinesGrouped.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center px-6 py-20 text-center text-sm"
          style={{ color: "var(--text-tertiary)" }}
        >
          {t("kiosk.noPlanningYet", { defaultValue: "Aucun planning enregistré" })}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 sm:p-4">
          {/* DESKTOP : table */}
          <div
            className="hidden overflow-x-auto rounded-xl border md:block"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[180px]" />
                {shiftNumbers.map((n) => (
                  <col key={n} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="sticky start-0 top-0 z-10 border-b-2 px-4 py-3 text-start text-xs font-black uppercase tracking-wide"
                    style={{
                      backgroundColor: "var(--bg-muted)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Factory size={14} />
                      {t("production.planning.machineCol", { defaultValue: "Machine" })}
                    </span>
                  </th>
                  {shiftNumbers.map((n) => (
                    <th
                      key={n}
                      className="border-b-2 border-s px-4 py-3 text-center text-xs font-black uppercase tracking-wide"
                      style={{
                        backgroundColor: "var(--bg-muted)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {t("production.planning.shift", { defaultValue: "Poste" })} {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machinesGrouped.map(({ machine, shifts }) => (
                  <tr key={machine.id} className="align-top">
                    <td
                      className="sticky start-0 z-[1] border-b border-e px-4 py-3"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Cog size={16} style={{ color: "var(--text-tertiary)" }} />
                        <div
                          className="truncate font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {machine.name}
                        </div>
                      </div>
                    </td>
                    {shiftNumbers.map((n) => {
                      const cellCards = shifts.get(n) ?? [];
                      return (
                        <td
                          key={n}
                          className="border-b border-s p-2 align-top"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <div className="flex flex-col gap-1.5">
                            {cellCards.length === 0 ? (
                              <div
                                className="flex h-[50px] items-center justify-center"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                <Circle size={8} />
                              </div>
                            ) : (
                              cellCards.map((c) => {
                                const isInProgress = c.status === "in_progress";
                                return (
                                  <div
                                    key={c.planning_id}
                                    className="relative flex overflow-hidden rounded-md border shadow-sm"
                                    style={{
                                      backgroundColor: "var(--bg-card)",
                                      borderColor: "var(--border-subtle)",
                                    }}
                                  >
                                    {isInProgress && (
                                      <span
                                        className="w-[4px] shrink-0"
                                        style={{ backgroundColor: "var(--brand-orange)" }}
                                      />
                                    )}
                                    <div className="min-w-0 flex-1 px-2.5 py-1.5">
                                      <div
                                        className="truncate text-[13px] font-bold leading-tight"
                                        style={{ color: "var(--text-primary)" }}
                                      >
                                        {c.piece_name || c.product_name || "—"}
                                      </div>
                                      <div className="mt-0.5 flex items-center justify-between gap-2">
                                        {c.project_code && (
                                          <span
                                            className="truncate font-mono text-[10px]"
                                            style={{ color: "var(--text-tertiary)" }}
                                            dir="ltr"
                                          >
                                            {c.project_code}
                                          </span>
                                        )}
                                        {c.cell_worker_name && (
                                          <span
                                            className="flex shrink-0 items-center gap-0.5 text-[10px]"
                                            style={{ color: "var(--text-tertiary)" }}
                                          >
                                            <User size={9} />
                                            {c.cell_worker_name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE : cartes par machine */}
          <div className="flex flex-col gap-3 md:hidden">
            {machinesGrouped.map(({ machine, shifts }) => (
              <div
                key={machine.id}
                className="overflow-hidden rounded-xl border shadow-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div
                  className="flex items-center gap-2 border-b px-4 py-3"
                  style={{
                    backgroundColor: "var(--bg-muted)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <Cog size={16} style={{ color: "var(--text-tertiary)" }} />
                  <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                    {machine.name}
                  </span>
                </div>
                <div className="flex flex-col">
                  {shiftNumbers.map((n) => {
                    const cellCards = shifts.get(n) ?? [];
                    if (cellCards.length === 0) return null;
                    return (
                      <div
                        key={n}
                        className="border-b last:border-b-0"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <div
                          className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wide"
                          style={{
                            backgroundColor: "var(--bg-muted)",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {t("production.planning.shift", { defaultValue: "Poste" })} {n}
                        </div>
                        <div className="flex flex-col gap-1.5 p-2">
                          {cellCards.map((c) => {
                            const isInProgress = c.status === "in_progress";
                            return (
                              <div
                                key={c.planning_id}
                                className="relative flex overflow-hidden rounded-md border shadow-sm"
                                style={{
                                  backgroundColor: "var(--bg-card)",
                                  borderColor: "var(--border-subtle)",
                                }}
                              >
                                {isInProgress && (
                                  <span
                                    className="w-[4px] shrink-0"
                                    style={{ backgroundColor: "var(--brand-orange)" }}
                                  />
                                )}
                                <div className="min-w-0 flex-1 px-3 py-2">
                                  <div
                                    className="truncate text-sm font-bold"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {c.piece_name || c.product_name || "—"}
                                  </div>
                                  {c.project_code && (
                                    <div
                                      className="mt-0.5 truncate font-mono text-[11px]"
                                      style={{ color: "var(--text-tertiary)" }}
                                      dir="ltr"
                                    >
                                      {c.project_code}
                                    </div>
                                  )}
                                  {c.cell_worker_name && (
                                    <div
                                      className="mt-0.5 flex items-center gap-1 truncate text-[11px]"
                                      style={{ color: "var(--text-tertiary)" }}
                                    >
                                      <User size={10} />
                                      {c.cell_worker_name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRM */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            className="w-full max-w-sm rounded-xl p-5 text-center shadow-2xl"
            style={{ backgroundColor: "var(--bg-card)" }}
          >
            <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("workerPlanning.logoutConfirm", { defaultValue: "Se déconnecter ?" })}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={logout}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t("workerPlanning.logoutButton", { defaultValue: "Se déconnecter" })}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold transition"
                style={{
                  borderColor: "var(--border-strong)",
                  color: "var(--text-secondary)",
                }}
              >
                {t("common.cancel", { defaultValue: "Annuler" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
