import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, RotateCcw, Upload } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { localDb } from "../../../lib/localDb";

/** Catégories exportables / réinitialisables. */
const EXPORT_TABLES = [
  "roles",
  "staff_users",
  "workers",
  "machines",
  "machine_tools",
  "clients",
  "projects",
  "quotes",
  "quote_items",
  "manufacturing_orders",
  "pieces_tasks",
  "planning",
  "work_shifts",
  "shift_piece_work",
  "work_sessions",
  "work_session_corrections",
  "activity_log",
  "piece_handoffs",
  "workshop_reclamations",
  "task_types",
  "stop_reasons",
  "inventory_items",
  "inventory_transactions",
  "invoices",
  "invoice_items",
  "nomenclatures",
  "nomenclature_columns",
  "nomenclature_rows",
  "nomenclature_cells",
  "odoo_config",
] as const;

type TableName = (typeof EXPORT_TABLES)[number];

/** Ordre de suppression (respecte les FK : enfants avant parents). */
const DELETE_ORDER: TableName[] = [
  "nomenclature_cells",
  "nomenclature_rows",
  "nomenclature_columns",
  "nomenclatures",
  "invoice_items",
  "invoices",
  "inventory_transactions",
  "inventory_items",
  "piece_handoffs",
  "workshop_reclamations",
  "work_session_corrections",
  "activity_log",
  "work_sessions",
  "shift_piece_work",
  "work_shifts",
  "planning",
  "pieces_tasks",
  "manufacturing_orders",
  "quote_items",
  "quotes",
  "projects",
  "clients",
  "machine_tools",
  "machines",
  "workers",
  "task_types",
  "stop_reasons",
];

/**
 * Ordre d'insertion pour l'import (parents avant enfants).
 *
 * ⚠️ CORRECTIF IMPORTANT : l'ordre précédent insérait `pieces_tasks` avant
 * `manufacturing_orders` et `manufacturing_orders` avant `quotes`, alors que
 * `pieces_tasks.manufacturing_order_id` référence `manufacturing_orders`, et
 * `manufacturing_orders.quote_id` référence `quotes` — une restauration
 * complète échouait donc systématiquement sur ces 3 tables (violation de
 * clé étrangère) dès qu'un devis ou un ordre de fabrication existait dans la
 * sauvegarde. L'ordre ci-dessous respecte la chaîne réelle de dépendances :
 * clients → projects → quotes → quote_items → manufacturing_orders →
 * pieces_tasks → planning → ...
 *
 * ⚠️ `staff_users` et `roles` sont VOLONTAIREMENT EXCLUS :
 *   - `staff_users` est protégé par RLS et ne peut être créé que via l'Edge
 *     Function `staff-invite` (service_role). Un `INSERT` côté client
 *     déclencherait une erreur 403 « row-level security policy ».
 *   - Les rôles système (`company_id IS NULL`) sont seedés par migration et
 *     ne doivent pas être dupliqués ; les rôles personnalisés seront créés
 *     via l'UI `RolesAdminPage`.
 *
 * Ces tables sont en revanche bien présentes dans l'EXPORT (pour sauvegarde
 * complète) — elles ne sont simplement pas restaurées côté client.
 */
const IMPORT_INSERT_ORDER: TableName[] = [
  "odoo_config",
  "task_types",
  "stop_reasons",
  "workers",
  "machines",
  "machine_tools",
  "clients",
  "projects",
  "quotes",
  "quote_items",
  "manufacturing_orders",
  "pieces_tasks",
  "planning",
  "work_shifts",
  "shift_piece_work",
  "work_sessions",
  "work_session_corrections",
  "activity_log",
  "piece_handoffs",
  "workshop_reclamations",
  "inventory_items",
  "inventory_transactions",
  "invoices",
  "invoice_items",
  "nomenclatures",
  "nomenclature_columns",
  "nomenclature_rows",
  "nomenclature_cells",
];

/** Découpe un tableau en lots pour éviter les requêtes trop volumineuses
 * (taille de payload / temporisation) lors de la restauration de grandes
 * entreprises. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const IMPORT_CHUNK_SIZE = 300;

interface CompanyProfile {
  id: string;
  name?: string;
  industry?: string | null;
  logo_url?: string | null;
  currency?: string | null;
  timezone?: string | null;
  [key: string]: unknown;
}

interface ExportPayload {
  _meta: {
    app: "AniXOS";
    version: 1;
    company_id: string;
    exported_at: string;
  };
  company?: CompanyProfile;
  tables: Partial<Record<TableName, unknown[]>>;
}

/** Champs du profil d'entreprise restaurables sans risque (jamais les clés
 * techniques comme `id` qui ne doivent jamais être réécrites). */
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
  const [pendingImport, setPendingImport] = useState<{
    payload: ExportPayload;
    rowCounts: Array<{ table: string; count: number }>;
    totalRows: number;
    companyMismatch: boolean;
    exportedAt: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const companyId = staffUser?.company_id ?? null;

  /** Toutes les catégories proposées à la réinitialisation, triées par ordre de suppression. */
  const resetCategories = useMemo(() => DELETE_ORDER, []);

  async function handleExport() {
    if (!companyId) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const payload: ExportPayload = {
        _meta: {
          app: "AniXOS",
          version: 1,
          company_id: companyId,
          exported_at: new Date().toISOString(),
        },
        tables: {},
      };

      // Profil de l'entreprise elle-même (nom, logo, devise...) : conservé à
      // part car `companies` n'a pas de colonne company_id (c'est la racine
      // du tenant) et ne suit donc pas le circuit générique ci-dessous.
      const { data: companyRow, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) console.warn("[export] companies:", companyError.message);
      else if (companyRow) payload.company = companyRow as CompanyProfile;

      for (const table of EXPORT_TABLES) {
        const { data, error } = await supabase.from(table).select("*");
        if (error) {
          // Table sans company_id (ex. roles système) : on saute silencieusement
          console.warn(`[export] ${table}:`, error.message);
          continue;
        }
        payload.tables[table] = data ?? [];
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anixos-backup-${companyId.slice(0, 8)}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[export]", err);
      setExportError(t("database.exportError"));
    } finally {
      setIsExporting(false);
    }
  }

  /** Étape 1 : lit le fichier et prépare un aperçu (comptage par table +
   * alerte si le fichier provient d'une autre entreprise) avant toute
   * écriture — une restauration modifie des données de production et ne
   * doit jamais démarrer sans confirmation explicite. */
  async function handleFileSelected(file: File) {
    setImportError(null);
    setImportSuccess(null);
    setImportWarnings([]);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ExportPayload;
      if (!payload.tables || typeof payload.tables !== "object") {
        throw new Error("invalid_format");
      }
      const rowCounts = IMPORT_INSERT_ORDER.filter(
        (table) => Array.isArray(payload.tables[table]) && (payload.tables[table] as unknown[]).length > 0
      ).map((table) => ({ table, count: (payload.tables[table] as unknown[]).length }));
      const totalRows = rowCounts.reduce((sum, r) => sum + r.count, 0);

      setPendingImport({
        payload,
        rowCounts,
        totalRows,
        companyMismatch: !!payload._meta?.company_id && payload._meta.company_id !== companyId,
        exportedAt: payload._meta?.exported_at ?? null,
      });
    } catch (err) {
      console.error("[import:read]", err);
      setImportError(t("database.importError"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** Étape 2 : exécution effective, après confirmation explicite de l'utilisateur. */
  async function confirmImport() {
    if (!companyId || !pendingImport) return;
    const { payload } = pendingImport;
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);
    setImportWarnings([]);
    try {
      let totalRows = 0;
      const failedTables: string[] = [];

      // Profil de l'entreprise (mise à jour ciblée, jamais un insert — la
      // ligne `companies` existe forcément déjà, c'est la racine du tenant).
      if (payload.company) {
        const patch: Record<string, unknown> = {};
        for (const field of COMPANY_PROFILE_FIELDS) {
          if (payload.company[field] !== undefined) patch[field] = payload.company[field];
        }
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("companies").update(patch).eq("id", companyId);
          if (error) {
            console.warn("[import] companies:", error.message);
            failedTables.push("companies");
          }
        }
      }

      for (const table of IMPORT_INSERT_ORDER) {
        const rows = payload.tables[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        // Forcer le company_id courant pour ne pas polluer un autre tenant
        const sanitized = rows.map((r) => ({
          ...(r as Record<string, unknown>),
          company_id: companyId,
        }));

        let tableFailed = false;
        for (const batch of chunk(sanitized, IMPORT_CHUNK_SIZE)) {
          const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
          if (error) {
            console.warn(`[import] ${table}:`, error.message);
            tableFailed = true;
            break; // inutile de continuer les lots suivants de cette table
          }
          totalRows += batch.length;
        }
        if (tableFailed) failedTables.push(table);
      }

      if (failedTables.length > 0) {
        setImportWarnings(failedTables);
        setImportSuccess(t("database.importPartial", { count: totalRows }));
      } else {
        setImportSuccess(t("database.importSuccess", { count: totalRows }));
      }
      setPendingImport(null);
    } catch (err) {
      console.error("[import]", err);
      setImportError(t("database.importError"));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleReset() {
    if (!companyId) return;
    const toDelete = resetCategories.filter((table) => resetSelections[table]);
    if (toDelete.length === 0) return;
    setIsResetting(true);
    setResetMessage(null);
    try {
      for (const table of DELETE_ORDER) {
        if (!toDelete.includes(table)) continue;
        const { error } = await supabase.from(table).delete().eq("company_id", companyId);
        if (error) {
          console.warn(`[reset] ${table}:`, error.message);
        }
      }
      // Vider les caches Dexie pour éviter toute réapparition de données locales
      await Promise.all([
        localDb.workers.clear(),
        localDb.machines.clear(),
        localDb.projects.clear(),
        localDb.piecesTasks.clear(),
        localDb.taskTypes.clear(),
        localDb.stopReasons.clear(),
        localDb.planning.clear(),
        localDb.workShifts.clear(),
        localDb.shiftPieceWork.clear(),
        localDb.workSessions.clear(),
        localDb.workSessionCorrections.clear(),
        localDb.activityLog.clear(),
        localDb.pieceHandoffs.clear(),
        localDb.workshopReclamations.clear(),
        localDb.machineTools.clear(),
        localDb.workerCredentials.clear(),
      ]);
      setResetMessage(t("database.resetSuccess"));
      setResetSelections({});
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
                <li key={table} className="font-mono">{table}</li>
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
                <li key={r.table} className="flex justify-between border-b border-blue-100/70 py-0.5 font-mono">
                  <span>{r.table}</span>
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
              <span className="font-mono text-slate-600">{table}</span>
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
            isResetting || resetCategories.every((table) => !resetSelections[table])
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