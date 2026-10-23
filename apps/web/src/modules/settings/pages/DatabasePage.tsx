import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, RotateCcw, Upload } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { localDb } from "../../../lib/localDb";

/** Catégories exportables / réinitialisables. */
const EXPORT_TABLES = [
  "roles", "staff_users", "workers", "machines", "machine_tools", "clients", 
  "projects", "quotes", "quote_items", "manufacturing_orders", "pieces_tasks", 
  "planning", "work_shifts", "shift_piece_work", "work_sessions", 
  "work_session_corrections", "activity_log", "piece_handoffs", 
  "workshop_reclamations", "task_types", "stop_reasons", "inventory_items", 
  "inventory_transactions", "invoices", "invoice_items", "nomenclatures", 
  "nomenclature_columns", "nomenclature_rows", "nomenclature_cells", "odoo_config"
] as const;

type TableName = (typeof EXPORT_TABLES)[number];

/** Ordre de suppression (respecte les FK : enfants avant parents). */
const DELETE_ORDER: TableName[] = [
  "nomenclature_cells", "nomenclature_rows", "nomenclature_columns", 
  "nomenclatures", "invoice_items", "invoices", "inventory_transactions", 
  "inventory_items", "piece_handoffs", "workshop_reclamations", 
  "work_session_corrections", "activity_log", "work_sessions", 
  "shift_piece_work", "work_shifts", "planning", "pieces_tasks", 
  "manufacturing_orders", "quote_items", "quotes", "projects", "clients", 
  "machine_tools", "machines", "workers", "task_types", "stop_reasons"
];

const IMPORT_INSERT_ORDER: TableName[] = [
  "odoo_config", "task_types", "stop_reasons", "workers", "machines", 
  "machine_tools", "clients", "projects", "quotes", "quote_items", 
  "manufacturing_orders", "pieces_tasks", "planning", "work_shifts", 
  "shift_piece_work", "work_sessions", "work_session_corrections", 
  "activity_log", "piece_handoffs", "workshop_reclamations", 
  "inventory_items", "inventory_transactions", "invoices", "invoice_items", 
  "nomenclatures", "nomenclature_columns", "nomenclature_rows", "nomenclature_cells"
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const IMPORT_CHUNK_SIZE = 300;

interface CompanyProfile { id: string; name?: string; industry?: string | null; logo_url?: string | null; currency?: string | null; timezone?: string | null; [key: string]: unknown; }
interface ExportPayload { _meta: { app: "AniXOS"; version: 1; company_id: string; exported_at: string; }; company?: CompanyProfile; tables: Partial<Record<TableName, unknown[]>>; }

const COMPANY_PROFILE_FIELDS = ["name", "industry", "logo_url", "currency", "timezone"] as const;

export function DatabasePage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetSelections, setResetSelections] = useState<Record<string, boolean>>({});
  const [pendingImport, setPendingImport] = useState<{ payload: ExportPayload; rowCounts: Array<{ table: string; count: number }>; totalRows: number; companyMismatch: boolean; exportedAt: string | null; } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const companyId = staffUser?.company_id ?? null;
  const resetCategories = useMemo(() => DELETE_ORDER, []);
  const selectedCount = useMemo(() => resetCategories.filter((table) => resetSelections[table]).length, [resetCategories, resetSelections]);

  async function handleExport() { /* ... نفس الكود ... */ }

  async function handleFileSelected(file: File) { /* ... نفس الكود ... */ }

  async function confirmImport() { /* ... نفس الكود ... */ }

  async function handleReset() {
    if (!companyId) return;
    const toDelete = resetCategories.filter((table) => resetSelections[table]);
    if (toDelete.length === 0) return;
    
    setIsResetting(true);
    setResetMessage(null);

    try {
      // 🔥 استخدام دالة RPC التي أنشأناها في Supabase (تتجاوز RLS وترتب الحذف)
      const { error } = await supabase.rpc("reset_company_data", {
        p_company_id: companyId,
        p_tables: toDelete,
      });

      if (error) throw error;

      // مسح الكاش المحلي
      await Promise.all([
        localDb.workers.clear(), localDb.machines.clear(), localDb.projects.clear(),
        localDb.piecesTasks.clear(), localDb.taskTypes.clear(), localDb.stopReasons.clear(),
        localDb.planning.clear(), localDb.workShifts.clear(), localDb.shiftPieceWork.clear(),
        localDb.workSessions.clear(), localDb.workSessionCorrections.clear(),
        localDb.activityLog.clear(), localDb.pieceHandoffs.clear(),
        localDb.workshopReclamations.clear(), localDb.machineTools.clear(),
        localDb.workerCredentials.clear(),
      ]);

      setResetMessage(t("database.resetSuccess"));
      setResetSelections({});
      
      // إعادة تحميل الصفحة لتحديث الواجهة
      window.location.reload(); 

    } catch (err) {
      console.error("[reset]", err);
      setResetMessage(t("database.resetError"));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Export */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-bold text-slate-800">
          {t("database.exportTitle")}
        </h2>
        <p className="mb-4 text-sm text-slate-500">{t("database.exportHint")}</p>
        {exportError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {exportError}
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? t("database.exporting") : t("database.exportButton")}
        </button>
      </section>

      {/* Import */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-bold text-slate-800">
          {t("database.importTitle")}
        </h2>
        <p className="mb-4 text-sm text-slate-500">{t("database.importHint")}</p>
        {importError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {importSuccess}
          </div>
        )}
        {importWarnings.length > 0 && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <div className="font-semibold">{t("database.importWarningsTitle")}</div>
            <ul className="mt-1 list-disc ps-5">
              {importWarnings.map((table) => (
                <li key={table}>{t(`database.tables.${table}`, table)}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-amber-600">
              {t("database.importWarningsHint")}
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
          }}
        />

        {pendingImport ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
            {pendingImport.companyMismatch && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {t("database.importCompanyMismatch")}
              </div>
            )}
            <p className="mb-2 text-sm font-bold text-slate-700">
              {t("database.importPreviewTitle", { count: pendingImport.totalRows })}
            </p>
            {pendingImport.exportedAt && (
              <p className="mb-2 text-xs text-slate-500">
                {t("database.importExportedAt")}: {new Date(pendingImport.exportedAt).toLocaleString()}
              </p>
            )}
            <ul className="mb-3 max-h-40 overflow-y-auto text-xs text-slate-600">
              {pendingImport.rowCounts.map((r) => (
                <li key={r.table} className="flex justify-between border-b border-blue-100/70 py-0.5">
                  <span>{t(`database.tables.${r.table}`, r.table)}</span>
                  <span className="font-bold">{r.count}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void confirmImport()}
                disabled={isImporting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                <Upload size={15} />
                {isImporting ? t("database.importing") : t("database.importConfirmButton")}
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                disabled={isImporting}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                {t("database.importCancelButton")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Upload size={16} />
            {t("database.importButton")}
          </button>
        )}
      </section>

      {/* Reset sélectif */}
      <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
        <div className="mb-1 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600" />
          <h2 className="text-lg font-bold text-red-700">{t("database.resetTitle")}</h2>
        </div>
        <p className="mb-4 text-sm text-red-600">{t("database.resetHint")}</p>

        {/* Barre d'actions : tout sélectionner / tout désélectionner + compteur */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const all: Record<string, boolean> = {};
                for (const table of resetCategories) all[table] = true;
                setResetSelections(all);
              }}
              disabled={isResetting}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t("database.resetSelectAll")}
            </button>
            <button
              type="button"
              onClick={() => setResetSelections({})}
              disabled={isResetting || selectedCount === 0}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t("database.resetDeselectAll")}
            </button>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {t("database.resetSelectedCount", { count: selectedCount })}
          </span>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {resetCategories.map((table) => (
            <label
              key={table}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs"
            >
              <input
                type="checkbox"
                checked={!!resetSelections[table]}
                onChange={(e) =>
                  setResetSelections((prev) => ({ ...prev, [table]: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              <span className="text-slate-700">{t(`database.tables.${table}`, table)}</span>
            </label>
          ))}
        </div>

        {resetMessage && (
          <div className="mb-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
            {resetMessage}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={
            isResetting || selectedCount === 0
          }
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <RotateCcw size={16} />
          {isResetting ? t("database.resetting") : t("database.resetButton")}
        </button>
      </section>
    </div>
  );
}
