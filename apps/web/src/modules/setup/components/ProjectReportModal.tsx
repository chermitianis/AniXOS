import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { AdminField, adminInputClass } from "./AdminField";
import type { ProjectProfitability } from "../../../shared/types/database";

interface PieceActual {
  piece_task_id: string;
  piece_name: string;
  phase: string | null;
  status: string;
  estimated_time_minutes: number | null;
  actual_time_minutes: number;
  actual_cost: number;
}

interface SessionDetail {
  id: string;
  worker_name: string;
  session_type: string;
  activity_name: string;
  started_at: string;
  duration_seconds: number | null;
  note: string | null;
}

interface ProjectReportModalProps {
  projectId: string;
  onClose: () => void;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "setup.pieceStatusPending",
  in_progress: "setup.statusInProgress",
  completed: "setup.statusCompleted",
  cancelled: "setup.pieceStatusCancelled",
};

export function ProjectReportModal({ projectId, onClose }: ProjectReportModalProps) {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<ProjectProfitability | null>(null);
  const [pieces, setPieces] = useState<PieceActual[]>([]);
  const [hasInvoice, setHasInvoice] = useState(false);
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);

  async function loadReport() {
    setIsLoading(true);
    const [{ data: profit }, { data: piecesData }, { data: invoices }, { data: sessionData }] = await Promise.all([
      supabase.from("v_project_profitability").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("v_piece_task_actuals").select("*").eq("project_id", projectId).order("sequence_order"),
      supabase.from("invoices").select("id").eq("project_id", projectId).limit(1),
      supabase.from("work_sessions").select("id, session_type, started_at, duration_seconds, note, workers(full_name), task_types(name), stop_reasons(name)").eq("project_id", projectId).order("started_at"),
    ]);

    setSummary(profit as ProjectProfitability | null);
    setPieces((piecesData as PieceActual[]) ?? []);
    setHasInvoice((invoices ?? []).length > 0);
    setSessions(((sessionData ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), worker_name: (row.workers as { full_name?: string } | null)?.full_name ?? "—",
      session_type: String(row.session_type),
      activity_name: (row.task_types as { name?: string } | null)?.name ?? (row.stop_reasons as { name?: string } | null)?.name ?? "—",
      started_at: String(row.started_at), duration_seconds: row.duration_seconds as number | null, note: row.note as string | null,
    })));
    setIsLoading(false);
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleIssueInvoice(e: FormEvent) {
    e.preventDefault();
    setInvoiceError(null);
    setIsIssuing(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice", {
        body: { project_id: projectId, invoice_number: invoiceNumber, due_date: dueDate || null },
      });

      if (error || !data?.success) {
        setInvoiceError(data?.message ?? "Erreur");
        return;
      }

      setShowInvoiceForm(false);
      await loadReport();
    } finally {
      setIsIssuing(false);
    }
  }

  const totalActualMinutes = pieces.reduce((sum, p) => sum + p.actual_time_minutes, 0);
  const totalActualCost = pieces.reduce((sum, p) => sum + p.actual_cost, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl print:max-h-none print:overflow-visible">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h2 className="text-xl font-bold text-slate-800">{t("setup.reportTitle")}</h2>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
              {t("common.print")} 🖨
            </button>
            <button onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
              {t("common.close")} ✕
            </button>
          </div>
        </div>

        {isLoading || !summary ? (
          <p className="text-sm text-slate-400">{t("setup.reportLoading")}</p>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-slate-800">{summary.project_name}</h3>
              <p className="text-sm text-slate-400">{summary.project_code}</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-lg font-bold text-slate-700" dir="ltr">
                  {(summary.actual_production_hours ?? 0).toFixed(1)} {t("setup.hoursShort")}
                </div>
                <div className="text-xs text-slate-400">{t("setup.actualTime")}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-lg font-bold text-slate-700" dir="ltr">
                  {(summary.actual_labor_cost ?? 0).toFixed(0)}
                </div>
                <div className="text-xs text-slate-400">{t("setup.laborCost")}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-lg font-bold text-slate-700" dir="ltr">
                  {summary.quoted_price?.toFixed(0) ?? "—"}
                </div>
                <div className="text-xs text-slate-400">{t("setup.quotedPrice")}</div>
              </div>
              <div className={`rounded-lg p-3 text-center ${(summary.net_profit ?? 0) >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                <div className={`text-lg font-bold ${(summary.net_profit ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`} dir="ltr">
                  {summary.net_profit?.toFixed(0) ?? "—"}
                </div>
                <div className="text-xs text-slate-400">{t("setup.netProfit")}</div>
              </div>
            </div>

            <h4 className="mb-2 font-bold text-slate-700">{t("setup.piecesBreakdown")}</h4>
            <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-start">{t("setup.piece")}</th>
                    <th className="px-3 py-2.5 text-start">{t("common.active")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.estimated")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.actual")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.map((p) => (
                    <tr key={p.piece_task_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{p.piece_name}</td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{t(STATUS_LABEL_KEYS[p.status] ?? p.status)}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {p.estimated_time_minutes ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {p.actual_time_minutes.toFixed(0)}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {p.actual_cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {pieces.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        {t("setup.noPiecesReport")}
                      </td>
                    </tr>
                  )}
                </tbody>
                {pieces.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-bold text-slate-700">
                      <td className="px-3 py-2.5 text-start" colSpan={3}>
                        {t("setup.totalRow")}
                      </td>
                      <td className="px-3 py-2.5 text-left" dir="ltr">
                        {totalActualMinutes.toFixed(0)}
                      </td>
                      <td className="px-3 py-2.5 text-left" dir="ltr">
                        {totalActualCost.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <h4 className="mb-2 font-bold text-slate-700">{t("setup.sessionDetails")}</h4>
            <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-start">{t("setup.worker")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.activity")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.startedAt")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.duration")}</th>
                    <th className="px-3 py-2.5 text-start">{t("setup.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-start text-slate-600">{session.worker_name}</td>
                      <td className="px-3 py-2.5 text-start text-slate-600">{session.activity_name}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {new Date(session.started_at).toLocaleString(i18n.language, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                        {Math.round((session.duration_seconds ?? ((Date.now() - new Date(session.started_at).getTime()) / 1000)) / 60)} {t("kiosk.minutesShort")}
                      </td>
                      <td className="px-3 py-2.5 text-start text-slate-500">{session.note ?? "—"}</td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-slate-400">
                        {t("setup.noSessionDetails")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="print:hidden">
              {hasInvoice ? (
                <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("setup.invoiceAlreadyDone")}</div>
              ) : showInvoiceForm ? (
                <form onSubmit={handleIssueInvoice} className="rounded-lg border border-slate-200 p-4">
                  <AdminField label={t("setup.invoiceNumber")}>
                    <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={adminInputClass} required />
                  </AdminField>
                  <AdminField label={t("setup.dueDate")}>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={adminInputClass} />
                  </AdminField>
                  {invoiceError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{invoiceError}</div>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowInvoiceForm(false)} className="flex-1 rounded-lg py-2 text-sm text-slate-500">
                      {t("common.cancel")}
                    </button>
                    <button type="submit" disabled={isIssuing} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white disabled:opacity-50">
                      {isIssuing ? t("setup.issuingBtn") : t("setup.confirmIssue")}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowInvoiceForm(true)}
                  className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white"
                >
                  {t("setup.issueInvoice")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}