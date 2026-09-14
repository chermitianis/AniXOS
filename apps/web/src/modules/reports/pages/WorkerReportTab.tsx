import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type { Worker } from "../../../shared/types/database";

/** صف من v_shift_report — تجميع رقمي كامل لحصة عامل واحدة */
interface ShiftReportRow {
  shift_id: string;
  worker_id: string;
  worker_name: string;
  started_at: string;
  ended_at: string | null;
  shift_duration_seconds: number;
  production_seconds: number;
  downtime_seconds: number;
  uncovered_seconds: number;
  labor_cost: number;
  events_count: number;
  corrections_count: number;
  pieces_worked: number;
}

/** صف من v_shift_session_detail — سطر واحد بأربعة أعمدة لكل حدث داخل الحصة */
interface ShiftEventRow {
  session_id: string;
  session_type: "production" | "downtime";
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  event_name: string | null;
  machine_name: string | null;
  project_name: string | null;
  piece_name: string | null;
}

/** صف من v_shift_piece_summary — الجدول الثاني: القطعة/المشروع/البداية/النهاية/الوقت الجملي */
interface ShiftPieceRow {
  id: string;
  piece_task_id: string;
  piece_name: string;
  project_id: string | null;
  project_name: string | null;
  started_at: string;
  ended_at: string | null;
  total_seconds: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function WorkerReportTab() {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [shifts, setShifts] = useState<ShiftReportRow[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [shiftEvents, setShiftEvents] = useState<ShiftEventRow[]>([]);
  const [shiftPieces, setShiftPieces] = useState<ShiftPieceRow[]>([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    async function loadWorkers() {
      const { data } = await supabase
        .from("workers")
        .select("id, company_id, full_name, username, rfid_code, photo_url, hourly_cost, skill_level, is_active, created_at, updated_at")
        .order("full_name");
      setWorkers((data as Worker[]) ?? []);
    }
    void loadWorkers();
  }, []);

  const loadShifts = useCallback(async () => {
    setIsLoadingShifts(true);
    let query = supabase
      .from("v_shift_report")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    if (selectedWorkerId) query = query.eq("worker_id", selectedWorkerId);

    const { data } = await query;
    setShifts((data as ShiftReportRow[]) ?? []);
    setIsLoadingShifts(false);
  }, [selectedWorkerId]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  // بث حي: أي حصة جديدة تنتهي (تسجيل خروج عامل) تظهر فوراً في القائمة —
  // "التقرير يُرسَل إلى قسم rapports فور تسجيل الخروج"
  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`worker-reports-${staffUser.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_shifts", filter: `company_id=eq.${staffUser.company_id}` },
        () => void loadShifts()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, loadShifts]);

  useEffect(() => {
    if (!selectedShiftId) {
      setShiftEvents([]);
      setShiftPieces([]);
      return;
    }
    async function loadDetail() {
      setIsLoadingDetail(true);
      const [eventsResult, piecesResult] = await Promise.all([
        supabase
          .from("v_shift_session_detail")
          .select("*")
          .eq("shift_id", selectedShiftId)
          .order("started_at", { ascending: true }),
        supabase
          .from("v_shift_piece_summary")
          .select("*")
          .eq("shift_id", selectedShiftId)
          .order("started_at", { ascending: true }),
      ]);
      setShiftEvents((eventsResult.data as ShiftEventRow[]) ?? []);
      setShiftPieces((piecesResult.data as ShiftPieceRow[]) ?? []);
      setIsLoadingDetail(false);
    }
    void loadDetail();
  }, [selectedShiftId]);

  const selectedShift = shifts.find((s) => s.shift_id === selectedShiftId) ?? null;

  // ملخص الوقت الإجمالي لكل نوع حدث ضمن الحصة المفتوحة
  const eventTypeSummary = (() => {
    const map = new Map<string, { label: string; totalSeconds: number; count: number }>();
    for (const e of shiftEvents) {
      const label = e.event_name ?? "—";
      const key = `${e.session_type}:${label}`;
      const existing = map.get(key) ?? { label: `${e.session_type === "production" ? "🔵" : "🟠"} ${label}`, totalSeconds: 0, count: 0 };
      existing.totalSeconds += e.duration_seconds;
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  })();

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* قائمة الحصص */}
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.selectWorkerLabel")}</label>
          <select
            value={selectedWorkerId}
            onChange={(e) => {
              setSelectedWorkerId(e.target.value);
              setSelectedShiftId(null);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t("setup.allWorkers")}</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
            {t("setup.shiftsList")} ({shifts.length})
          </h3>
          {isLoadingShifts ? (
            <p className="p-4 text-sm text-slate-400">{t("setup.loadingSimple")}</p>
          ) : shifts.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">{t("setup.noShiftsYet")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shifts.map((s) => (
                <li key={s.shift_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedShiftId(s.shift_id)}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-start transition-colors ${
                      selectedShiftId === s.shift_id ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-sm font-bold text-slate-700">{s.worker_name}</span>
                    <span className="text-xs text-slate-400" dir="ltr">
                      {new Date(s.started_at).toLocaleString(i18n.language, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {" → "}
                      {s.ended_at
                        ? new Date(s.ended_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })
                        : t("setup.ongoing")}
                    </span>
                    <span className="text-xs font-semibold text-indigo-600" dir="ltr">
                      {formatDuration(s.shift_duration_seconds)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* تفصيل الحصة المختارة */}
      <div className="flex flex-col gap-4">
        {!selectedShift ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
            {t("setup.selectShiftPrompt")}
          </div>
        ) : (
          <>
            {/* رأس التقرير: الإحصاءات الجملية */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("setup.workerNameCol")}</div>
                <div className="mt-1 text-sm font-black text-slate-800">{selectedShift.worker_name}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("setup.shiftDuration")}</div>
                <div className="mt-1 text-sm font-black text-indigo-700" dir="ltr">{formatDuration(selectedShift.shift_duration_seconds)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("setup.totalProductionTime")}</div>
                <div className="mt-1 text-sm font-black text-blue-700" dir="ltr">{formatDuration(selectedShift.production_seconds)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("setup.totalDowntime")}</div>
                <div className="mt-1 text-sm font-black text-orange-600" dir="ltr">{formatDuration(selectedShift.downtime_seconds)}</div>
              </div>
            </div>

            {/* الجدول التفصيلي — أربعة أعمدة: الحدث، البداية، النهاية، المدة */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-bold text-slate-800">{t("setup.detailedEventLog")}</h3>
              {isLoadingDetail ? (
                <p className="text-sm text-slate-400">{t("setup.loadingSimple")}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2.5 text-start">{t("setup.eventCol")}</th>
                        <th className="px-3 py-2.5 text-left">{t("setup.startCol")}</th>
                        <th className="px-3 py-2.5 text-left">{t("setup.endCol")}</th>
                        <th className="px-3 py-2.5 text-left">{t("setup.durationCol")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftEvents.map((e) => (
                        <tr key={e.session_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                          <td className="px-3 py-2.5 text-start font-semibold text-slate-700">
                            {e.session_type === "production" ? "🔵" : "🟠"} {e.event_name ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                            {new Date(e.started_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                            {e.ended_at
                              ? new Date(e.ended_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })
                              : t("setup.ongoing")}
                          </td>
                          <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                            {formatDuration(e.duration_seconds)}
                          </td>
                        </tr>
                      ))}
                      {shiftEvents.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">
                            {t("setup.noSessionsWorker")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* الجدول الثاني: القطع/المشاريع التي اشتغل عليها العامل في هذه
                الحصة — خمسة أعمدة، بعدد أسطر يساوي عدد القطع */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-bold text-slate-800">{t("setup.piecesWorkedTitle")}</h3>
              {isLoadingDetail ? (
                <p className="text-sm text-slate-400">{t("setup.loadingSimple")}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2.5 text-start">{t("setup.pieceCol")}</th>
                        <th className="px-3 py-2.5 text-start">{t("setup.projectCol")}</th>
                        <th className="px-3 py-2.5 text-left">{t("setup.startCol")}</th>
                        <th className="px-3 py-2.5 text-left">{t("setup.endCol")}</th>
                        <th className="px-3 py-2.5 text-left">{t("setup.durationCol")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftPieces.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                          <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{p.piece_name}</td>
                          <td className="px-3 py-2.5 text-start text-slate-500">{p.project_name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                            {new Date(p.started_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                            {p.ended_at
                              ? new Date(p.ended_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })
                              : t("setup.ongoing")}
                          </td>
                          <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                            {formatDuration(p.total_seconds)}
                          </td>
                        </tr>
                      ))}
                      {shiftPieces.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">
                            {t("setup.noSessionsWorker")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ملخص الوقت الإجمالي لكل نوع حدث */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-bold text-slate-800">{t("setup.eventSummaryTitle")}</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5 text-start">{t("setup.itemCol")}</th>
                      <th className="px-3 py-2.5 text-left">{t("setup.countCol")}</th>
                      <th className="px-3 py-2.5 text-left">{t("setup.totalTimeCol")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventTypeSummary.map((s) => (
                      <tr key={s.label} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{s.label}</td>
                        <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{s.count}</td>
                        <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{formatDuration(s.totalSeconds)}</td>
                      </tr>
                    ))}
                    {eventTypeSummary.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400">
                          {t("setup.noSessionsWorker")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
