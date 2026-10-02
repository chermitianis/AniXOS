import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Factory,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Cpu,
  Wrench,
  User,
  Circle,
  Loader2,
} from "lucide-react";
import {
  fetchDayPlanningForKiosk,
  type KioskPlanningCard,
} from "../api/kioskApi";

interface Props {
  onClose: () => void;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

/**
 * Vue planning en LECTURE SEULE pour l'opérateur.
 * Grille : machines (lignes) × shifts (colonnes).
 * Cartes compactes : nom de la pièce + code projet.
 * Barre orange à gauche si la pièce est en cours.
 */
export function PlanningOverviewModal({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [cards, setCards] = useState<KioskPlanningCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));

  const load = useCallback(async (date: string) => {
    setIsLoading(true);
    const data = await fetchDayPlanningForKiosk(date);
    setCards(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load(selectedDate);
  }, [selectedDate, load]);

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

  /** Machines triées + leurs cartes regroupées par shift */
  const machinesGrouped = useMemo(() => {
    const map = new Map<
      string,
      {
        machine: {
          id: string;
          name: string;
          code: string | null;
          interface_type: string | null;
        };
        shifts: Map<number, KioskPlanningCard[]>;
      }
    >();

    for (const c of cards) {
      if (!map.has(c.machine_id)) {
        map.set(c.machine_id, {
          machine: {
            id: c.machine_id,
            name: c.machine_name,
            code: c.machine_code,
            interface_type: c.machine_interface,
          },
          shifts: new Map(),
        });
      }
      const entry = map.get(c.machine_id)!;
      const arr = entry.shifts.get(c.shift_number) ?? [];
      arr.push(c);
      entry.shifts.set(c.shift_number, arr);
    }

    for (const entry of map.values()) {
      for (const [shiftN, arr] of entry.shifts) {
        arr.sort((a, b) => a.sequence_order - b.sequence_order);
        entry.shifts.set(shiftN, arr);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.machine.name.localeCompare(b.machine.name),
    );
  }, [cards]);

  /** Nombre maximal de shifts parmi toutes les machines */
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

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm">
      <div className="flex h-[95vh] w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header + navigation par date */}
        <div className="flex flex-col gap-3 bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <CalendarDays size={20} />
            {t("kiosk.planningOverviewTitle")}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              className="rounded-lg p-1.5 hover:bg-white/15"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold">
              <CalendarDays size={15} />
              <span>{dateLabel}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="ms-1 rounded bg-transparent text-xs text-white outline-none [color-scheme:dark]"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              className="rounded-lg p-1.5 hover:bg-white/15"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ms-2 rounded-lg p-2 hover:bg-white/15"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            {t("setup.loadingSimple")}
          </div>
        ) : machinesGrouped.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("kiosk.noPlanningYet")}
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-slate-50/50 p-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="w-[180px]" />
                  {shiftNumbers.map((n) => (
                    <col key={n} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="sticky start-0 top-0 z-10 border-b-2 border-slate-200 bg-slate-100 px-4 py-3 text-start text-xs font-black uppercase tracking-wide text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Factory size={14} />
                        {t("production.planning.machineCol")}
                      </span>
                    </th>
                    {shiftNumbers.map((n) => (
                      <th
                        key={n}
                        className="border-b-2 border-s border-slate-200 bg-slate-100 px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600"
                      >
                        {t("production.planning.shift")} {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machinesGrouped.map(({ machine, shifts }) => {
                    const isCnc = machine.interface_type !== "classique";
                    return (
                      <tr key={machine.id} className="align-top">
                        {/* Colonne machine (sticky) */}
                        <td className="sticky start-0 z-[1] border-b border-e border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isCnc ? (
                              <Cpu size={16} className="shrink-0 text-amber-600" />
                            ) : (
                              <Wrench size={16} className="shrink-0 text-blue-600" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-bold text-slate-800">
                                {machine.name}
                              </div>
                              {machine.code && (
                                <div
                                  className="truncate font-mono text-[10px] text-slate-400"
                                  dir="ltr"
                                >
                                  {machine.code}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Colonnes shifts */}
                        {shiftNumbers.map((n) => {
                          const cellCards = shifts.get(n) ?? [];
                          const firstCard = cellCards[0];
                          const cellWorkerName =
                            firstCard?.cell_worker_name ?? firstCard?.worker_name ?? null;

                          return (
                            <td
                              key={n}
                              className="border-b border-s border-slate-200 p-2 align-top"
                            >
                              <div className="flex flex-col gap-1.5">
                                {/* Badge worker de la cellule */}
                                {cellWorkerName && (
                                  <div className="flex items-center gap-1 self-start rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                    <User size={11} />
                                    <span className="max-w-[140px] truncate">
                                      {cellWorkerName}
                                    </span>
                                  </div>
                                )}

                                {/* Cartes compactes */}
                                {cellCards.length === 0 ? (
                                  <div className="flex h-[50px] items-center justify-center text-[11px] text-slate-300">
                                    <Circle size={8} />
                                  </div>
                                ) : (
                                  cellCards.map((c) => {
                                    const isInProgress = c.status === "in_progress";
                                    return (
                                      <div
                                        key={c.planning_id}
                                        className={`relative flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition-all hover:border-indigo-300 hover:shadow`}
                                      >
                                        {/* Barre orange à gauche si en cours */}
                                        {isInProgress && (
                                          <span
                                            className="w-[4px] shrink-0 bg-orange-600"
                                            aria-hidden="true"
                                          />
                                        )}
                                        <div className="min-w-0 flex-1 px-2.5 py-1.5">
                                          <div className="truncate text-[13px] font-bold leading-tight text-slate-800">
                                            {c.piece_name || c.product_name || "—"}
                                          </div>
                                          {c.project_code && (
                                            <div
                                              className="truncate font-mono text-[10px] text-slate-400"
                                              dir="ltr"
                                            >
                                              {c.project_code}
                                            </div>
                                          )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}