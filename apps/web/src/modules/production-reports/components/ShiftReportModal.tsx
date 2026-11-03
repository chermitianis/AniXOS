import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PrintLayout } from "./PrintLayout";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { supabase } from "../../../lib/supabaseClient";
import { getShiftEvents, type DailyShiftRow, type DailyEventRow } from "../api/productionReportsApi";

interface ShiftReportModalProps {
  shift: DailyShiftRow;
  onClose: () => void;
}

export function ShiftReportModal({ shift, onClose }: ShiftReportModalProps) {
  const { staffUser } = useStaffAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [events, setEvents] = useState<DailyEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!staffUser?.company_id) return;
      const companyId = staffUser.company_id;

      // جلب شعار الشركة واسمها
      const { data: company } = await supabase
        .from("companies")
        .select("name, logo_url")
        .eq("id", companyId)
        .maybeSingle();
      setLogoUrl((company as any)?.logo_url ?? null);
      setCompanyName((company as any)?.name ?? "");

      // جلب أحداث الوردية
      const ev = await getShiftEvents(companyId, shift.shift_id);
      setEvents(ev);
      setIsLoading(false);
    }
    void loadData();
  }, [staffUser?.company_id, shift.shift_id]);

  function fmtSec(s: number): string {
    if (s <= 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}`;
  }

  function computeSummary(shiftEvents: DailyEventRow[]) {
    let totalProduction = 0;
    let totalDowntime = 0;
    for (const e of shiftEvents) {
      const dur = e.duration_seconds ?? 0;
      if (e.session_type === "production") totalProduction += dur;
      else totalDowntime += dur;
    }
    return { totalProduction, totalDowntime };
  }

  const summary = computeSummary(events);

  return (
    <PrintLayout
      title="Rapport Journalier"
      subtitle=""
      logoUrl={logoUrl}
      companyName={companyName}
      onClose={onClose}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="me-2 animate-spin" size={18} /> Chargement...
        </div>
      ) : (
        <div className="space-y-6">
          {/* معلومات الوردية */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Informations de la Session</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Opérateur</div>
                <div className="font-semibold">{shift.worker_name}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Date</div>
                <div className="font-semibold">{new Date(shift.started_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Début</div>
                <div className="font-semibold">{new Date(shift.started_at).toLocaleTimeString("fr-FR")}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Fin</div>
                <div className="font-semibold">{shift.ended_at ? new Date(shift.ended_at).toLocaleTimeString("fr-FR") : "En cours"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Durée totale</div>
                <div className="font-semibold">{fmtSec(shift.duration_seconds)}</div>
              </div>
            </div>
          </section>

          {/* ملخص الإنتاجية */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Résumé de la Production</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-3">
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Temps de production</div><div className="font-semibold text-green-600">{fmtSec(summary.totalProduction)}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Temps d'arrêt</div><div className="font-semibold text-amber-600">{fmtSec(summary.totalDowntime)}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Taux de production</div><div className="font-semibold">{shift.duration_seconds > 0 ? `${((summary.totalProduction / shift.duration_seconds) * 100).toFixed(1)}%` : "—"}</div></div>
            </div>
          </section>

          {/* جدول الأحداث */}
          <section>
            {/* ✅ اسم العامل فوق جدول التفاصيل (على اليسار) */}
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Journal des Événements</h2>
              <span className="text-sm font-semibold text-slate-700">Opérateur : {shift.worker_name}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Heure</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Pièce</th>
                  <th className="px-3 py-2 text-end">Durée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => {
                  const isProduction = e.session_type === "production";
                  return (
                    <tr key={e.session_id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{new Date(e.started_at).toLocaleTimeString("fr-FR")}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${isProduction ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {isProduction ? "Production" : "Arrêt"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold">{e.task_type_name ?? e.stop_reason_name ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{e.piece_name ?? "—"}</td>
                      <td className="px-3 py-2 text-end font-mono font-semibold">{e.duration_seconds != null ? fmtSec(e.duration_seconds) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </PrintLayout>
  );
}