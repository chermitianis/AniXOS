import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import type { Machine } from "../../../shared/types/database";

interface MachineSessionRow {
  id: string;
  session_type: "production" | "downtime";
  started_at: string;
  duration_seconds: number | null;
  worker_name?: string;
  project_name?: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function MachineReportTab() {
  const { t, i18n } = useTranslation();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [sessions, setSessions] = useState<MachineSessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadMachines() {
      const { data } = await supabase.from("machines").select("*").order("name");
      setMachines((data as Machine[]) ?? []);
    }
    void loadMachines();
  }, []);

  useEffect(() => {
    if (!selectedMachineId) {
      setSessions([]);
      return;
    }

    async function loadSessions() {
      setIsLoading(true);
      const { data } = await supabase
        .from("work_sessions")
        .select("*, workers(full_name), projects(name)")
        .eq("machine_id", selectedMachineId)
        .order("started_at", { ascending: false })
        .limit(200);

      const rows = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        session_type: row.session_type as "production" | "downtime",
        started_at: row.started_at as string,
        duration_seconds: row.duration_seconds as number | null,
        worker_name: (row.workers as { full_name?: string } | null)?.full_name,
        project_name: (row.projects as { name?: string } | null)?.name,
      }));

      setSessions(rows);
      setIsLoading(false);
    }

    void loadSessions();
  }, [selectedMachineId]);

  const totalRunningSeconds = sessions
    .filter((s) => s.session_type === "production")
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const totalDowntimeSeconds = sessions
    .filter((s) => s.session_type === "downtime")
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const distinctWorkers = new Set(sessions.map((s) => s.worker_name).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.selectMachineLabel")}</label>
        <select value={selectedMachineId} onChange={(e) => setSelectedMachineId(e.target.value)} className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t("setup.selectDots")}</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-slate-400">{t("setup.loadingSimple")}</p>}

      {!isLoading && selectedMachineId && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-lg font-bold text-blue-600" dir="ltr">
                {formatDuration(totalRunningSeconds)}
              </div>
              <div className="text-xs text-slate-400">{t("setup.runningTimeShort")}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-lg font-bold text-orange-600" dir="ltr">
                {formatDuration(totalDowntimeSeconds)}
              </div>
              <div className="text-xs text-slate-400">{t("setup.downtimeLabel")}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-lg font-bold text-slate-700">{sessions.length}</div>
              <div className="text-xs text-slate-400">{t("setup.sessionsCount")}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-lg font-bold text-slate-700">{distinctWorkers}</div>
              <div className="text-xs text-slate-400">{t("setup.workersUsingIt")}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-bold text-slate-800">{t("setup.usageLogTitle")}</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-start">{t("setup.typeCol")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.workerCol")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.projectCol")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.startCol")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.durationCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-start">
                        <span className={`font-semibold ${s.session_type === "production" ? "text-blue-600" : "text-orange-600"}`}>
                          {s.session_type === "production" ? t("setup.typeProduction") : t("setup.typeDowntime")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{s.worker_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{s.project_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {new Date(s.started_at).toLocaleString(i18n.language, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {s.duration_seconds !== null ? formatDuration(s.duration_seconds) : "—"}
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        {t("setup.noSessionsMachine")}
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
  );
}
