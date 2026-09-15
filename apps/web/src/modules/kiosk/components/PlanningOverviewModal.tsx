import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Factory, ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { fetchMachinePlanningOverview, type MachinePlanningRow } from "../api/kioskApi";

interface Props {
  onClose: () => void;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

/** المخطط الكامل لكل الآلات ليوم محدد — يفتحه العامل من أي مكان بعد تسجيل
 * دخوله. يتحدّث دائماً حسب اليوم المختار (أمس/اليوم/غد أو أي تاريخ مستقبلي
 * برمجه المسؤول)، وليس ثابتاً على "اليوم" فقط. */
export function PlanningOverviewModal({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<MachinePlanningRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));

  const load = useCallback(async (date: string) => {
    setIsLoading(true);
    const data = await fetchMachinePlanningOverview(date);
    setRows(data);
    setSelectedMachineId((current) => (current && data.some((r) => r.machine_id === current) ? current : (data[0]?.machine_id ?? null)));
    setIsLoading(false);
  }, []);

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
          : new Date(selectedDate + "T00:00:00").toLocaleDateString(i18n.language, { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[85vh] sm:w-[90vw]">
        {/* Header + navigation par date */}
        <div className="flex flex-col gap-3 bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-extrabold">{t("kiosk.planningOverviewTitle")}</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedDate((d) => addDays(d, -1))} className="rounded-lg p-1.5 hover:bg-white/15">
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
            <button type="button" onClick={() => setSelectedDate((d) => addDays(d, 1))} className="rounded-lg p-1.5 hover:bg-white/15">
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={onClose} className="ms-2 rounded-lg p-2 hover:bg-white/15">
              <X size={20} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("setup.loadingSimple")}
          </div>
        ) : machines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("kiosk.noPlanningYet")}
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
            {/* قائمة الآلات — عمودية على اليسار في الشاشات الكبيرة، شريط أفقي قابل للتمرير على الجوال */}
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-1.5 sm:w-48 sm:flex-col sm:gap-0 sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-e sm:p-0">
              {machines.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMachineId(m.id)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-start text-sm font-semibold transition-colors sm:block sm:w-full sm:rounded-none sm:py-3 ${
                    selectedMachineId === m.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>

            {/* محتوى الآلة المختارة */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
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
                      <tr key={r.planning_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 text-start font-semibold text-indigo-700">{r.worker_name}</td>
                        <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{r.project_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-start text-slate-500">{r.piece_ref ?? "—"}</td>
                        <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{r.quantity ?? "—"}</td>
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
      </div>
    </div>
  );
}
