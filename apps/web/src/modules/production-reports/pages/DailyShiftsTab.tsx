import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, CalendarDays, ChevronDown, ChevronRight, Play, Pause,
  Download, Filter, Printer
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  listDailyShifts,
  getShiftEvents,
  type DailyShiftRow,
  type DailyEventRow,
} from "../api/productionReportsApi";
import { supabase } from "../../../lib/supabaseClient";
import { ShiftReportModal } from "../components/ShiftReportModal";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sevenDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyShiftsTab() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [fromDate, setFromDate] = useState(sevenDaysAgoIso());
  const [toDate, setToDate] = useState(todayIso());
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [workers, setWorkers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [shifts, setShifts] = useState<DailyShiftRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printShift, setPrintShift] = useState<DailyShiftRow | null>(null);
  const [events, setEvents] = useState<Record<string, DailyEventRow[]>>({});

  useEffect(() => {
    if (!companyId) return;
    void supabase
      .from("workers")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setWorkers((data as Array<{ id: string; full_name: string }>) ?? []));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setIsLoading(true);
    void listDailyShifts(companyId, fromDate, toDate)
      .then(setShifts)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [companyId, fromDate, toDate]);

  const filteredShifts = useMemo(() => {
    if (!selectedWorkerId) return shifts;
    return shifts.filter((s) => s.worker_id === selectedWorkerId);
  }, [shifts, selectedWorkerId]);

  async function toggleExpand(shiftId: string) {
    if (expanded === shiftId) {
      setExpanded(null);
      return;
    }
    setExpanded(shiftId);
    if (!companyId || events[shiftId]) return;
    const ev = await getShiftEvents(companyId, shiftId);
    setEvents((prev) => ({ ...prev, [shiftId]: ev }));
  }

  function fmtSec(s: number): string {
    if (s <= 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}`;
  }

  async function exportToCsv() {
    const rows: Array<{ worker: string; started_at: string; ended_at: string | null; duration_seconds: number; events: string }> = [];
    for (const s of filteredShifts) {
      const shiftEvents = events[s.shift_id] ?? [];
      let eventLog = "";
      if (shiftEvents.length > 0) {
        eventLog = shiftEvents.map(e =>
          `${new Date(e.started_at).toLocaleTimeString()}: ${e.task_type_name ?? e.stop_reason_name ?? e.session_type} (${e.piece_name ?? '-'}) [${fmtSec(e.duration_seconds ?? 0)}]`
        ).join(" | ");
      } else {
        eventLog = "Aucun événement chargé (cliquez sur la ligne pour charger)";
      }
      rows.push({
        worker: s.worker_name,
        started_at: new Date(s.started_at).toLocaleString(),
        ended_at: s.ended_at ? new Date(s.ended_at).toLocaleString() : "En cours",
        duration_seconds: s.duration_seconds,
        events: eventLog,
      });
    }
    const header = "Worker;Started;Ended;Duration;Events\n";
    const csv = header + rows.map(r => `${r.worker};${r.started_at};${r.ended_at};${fmtSec(r.duration_seconds)};${r.events}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_journalier_${fromDate}_${toDate}.csv`;
    a.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("productionReports.daily.from")}
          </label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("productionReports.daily.to")}
          </label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Filter size={10} className="inline mr-1" /> Opérateur
          </label>
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Tous les opérateurs</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.full_name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void exportToCsv()}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700"
        >
          <Download size={14} /> Exporter CSV
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="me-2 animate-spin" size={18} />
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : filteredShifts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
          <CalendarDays size={32} className="mx-auto mb-2 text-slate-300" />
          {t("productionReports.daily.empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredShifts.map((s) => {
            const isOpen = expanded === s.shift_id;
            const isSelected = selectedId === s.shift_id;
            const shiftEvents = events[s.shift_id] ?? [];
            return (
              <li
                key={s.shift_id}
                onClick={() => setSelectedId(isSelected ? null : s.shift_id)}
                className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                  isSelected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
                }`}
              >
                <div className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleExpand(s.shift_id);
                    }}
                    className="shrink-0"
                  >
                    {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">{s.worker_name}</span>
                      {s.is_force_closed && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          {t("productionReports.daily.forceClosed")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400" dir="ltr">
                      {new Date(s.started_at).toLocaleString("fr-FR")}
                      {s.ended_at ? ` → ${new Date(s.ended_at).toLocaleString("fr-FR")}` : ` (${t("productionReports.daily.ongoing")})`}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="text-sm font-bold text-slate-700">{fmtSec(s.duration_seconds)}</div>
                    <div className="text-[10px] text-slate-400">
                      {s.pieces_count} {t("productionReports.daily.piecesShort")} · {s.events_count} {t("productionReports.daily.eventsShort")}
                    </div>
                  </div>
                  {isSelected && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrintShift(s);
                      }}
                      className="ml-2 shrink-0 rounded-lg bg-slate-800 p-2 text-white shadow-sm hover:bg-slate-700"
                      title="Imprimer le rapport"
                    >
                      <Printer size={14} />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-3">
                    {shiftEvents.length === 0 ? (
                      <p className="rounded-lg bg-white px-3 py-4 text-center text-xs text-slate-400">
                        {t("productionReports.daily.noEvents")}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {shiftEvents.map((e) => {
                          const isProduction = e.session_type === "production";
                          const Icon = isProduction ? Play : Pause;
                          return (
                            <li key={e.session_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                              <Icon size={12} className={isProduction ? "text-green-600" : "text-amber-600"} />
                              <span className="font-semibold text-slate-700">
                                {e.task_type_name ?? e.stop_reason_name ?? e.session_type}
                              </span>
                              {e.piece_name && <span className="text-slate-500">· {e.piece_name}</span>}
                              {e.project_name && <span className="text-slate-400">· {e.project_name}</span>}
                              <span className="ms-auto font-mono text-[10px] text-slate-400" dir="ltr">
                                {e.duration_seconds != null ? fmtSec(e.duration_seconds) : "—"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {printShift && (
        <ShiftReportModal
          shift={printShift}
          onClose={() => setPrintShift(null)}
        />
      )}
    </div>
  );
}
