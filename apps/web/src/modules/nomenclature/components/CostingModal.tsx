import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type {
  NomenclatureColumn,
  NomenclatureRow,
  NomenclatureCell,
} from "../../../shared/types/database";

/** Interfaces locales (pattern du repo) */
type ColumnExt = NomenclatureColumn & { hourly_rate: number | null };
type RowExt = NomenclatureRow & { piece_task_id: string | null };

interface CostingModalProps {
  pieceIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function CostingModal({ pieceIds, onClose, onSaved }: CostingModalProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [columns, setColumns] = useState<ColumnExt[]>([]);
  const [rows, setRows] = useState<RowExt[]>([]);
  const [cells, setCells] = useState<Map<string, NomenclatureCell>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cellKey = (rowId: string, colId: string) => `${rowId}:${colId}`;

  /** Charge ou crée une étude pour les pièces sélectionnées.
   *  - Récupère le project_id de la première pièce (toutes les pièces doivent
   *    appartenir au même projet pour cette version).
   *  - Cherche une nomenclature existante pour ce projet, sinon en crée une.
   *  - Clone les colonnes du dernier modèle de la société si l'étude est vide.
   *  - Insère une ligne par pièce (upsert idempotent). */
  const load = useCallback(async () => {
    if (!staffUser || pieceIds.length === 0) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1) Récupérer le projet des pièces sélectionnées
      const { data: piecesData, error: piecesErr } = await supabase
        .from("pieces_tasks")
        .select("id, name, project_id")
        .in("id", pieceIds);
      if (piecesErr) throw piecesErr;
      const pieces = (piecesData ?? []) as { id: string; name: string; project_id: string }[];
      if (pieces.length === 0) throw new Error("no_pieces");

      // Toutes les pièces doivent partager le même projet
      const projectIds = new Set(pieces.map((p) => p.project_id));
      if (projectIds.size > 1) throw new Error("multi_project");
      const projectId = pieces[0].project_id;

      // 2) Chercher une nomenclature existante pour ce projet
      const { data: nomData } = await supabase
        .from("nomenclatures")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nom = nomData as { id: string; company_id: string; name: string } | null;
      if (!nom) {
        const { data: created, error: createErr } = await supabase
          .from("nomenclatures")
          .insert({
            company_id: staffUser.company_id,
            project_id: projectId,
            name: pieces[0].name,
            created_by: staffUser.id,
          })
          .select()
          .single();
        if (createErr) throw createErr;
        nom = created as { id: string; company_id: string; name: string };
      }
      setStudyId(nom.id);

      // 3) Charger les colonnes + rows + cells
      const [{ data: colsData }, { data: rowsData }, { data: cellsData }] = await Promise.all([
        supabase.from("nomenclature_columns").select("*").eq("nomenclature_id", nom.id).order("sequence_order"),
        supabase.from("nomenclature_rows").select("*").eq("nomenclature_id", nom.id).order("sequence_order"),
        supabase.from("nomenclature_cells").select("*").eq("nomenclature_id", nom.id),
      ]);

      let liveColumns = (colsData as ColumnExt[]) ?? [];
      let liveRows = (rowsData as RowExt[]) ?? [];

      // 4) Cloner les colonnes du dernier modèle si l'étude est vide
      if (liveColumns.length === 0) {
        const { data: templateNom } = await supabase
          .from("nomenclatures")
          .select("id")
          .eq("company_id", staffUser.company_id)
          .neq("id", nom.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (templateNom) {
          const { data: templateCols } = await supabase
            .from("nomenclature_columns")
            .select("*")
            .eq("nomenclature_id", (templateNom as { id: string }).id)
            .order("sequence_order");
          if (templateCols && templateCols.length > 0) {
            const clones = (templateCols as ColumnExt[]).map((c) => ({
              nomenclature_id: nom.id,
              company_id: staffUser.company_id,
              name: c.name,
              column_type: c.column_type,
              hourly_rate: c.hourly_rate,
              is_total_column: c.is_total_column,
              sequence_order: c.sequence_order,
            }));
            const { data: insertedCols } = await supabase.from("nomenclature_columns").insert(clones).select();
            if (insertedCols) liveColumns = insertedCols as ColumnExt[];
          }
        }
      }

      // 5) Insérer les lignes (upsert idempotent par (nomenclature_id, piece_task_id))
      const existingPieceIds = new Set(liveRows.map((r) => r.piece_task_id).filter(Boolean));
      const missing = pieces.filter((p) => !existingPieceIds.has(p.id));
      if (missing.length > 0) {
        const inserts = missing.map((p, i) => ({
          nomenclature_id: nom.id,
          company_id: staffUser.company_id,
          row_label: p.name,
          piece_task_id: p.id,
          sequence_order: liveRows.length + i,
        }));
        const { data: inserted } = await supabase
          .from("nomenclature_rows")
          .upsert(inserts, { onConflict: "nomenclature_id,piece_task_id", ignoreDuplicates: true })
          .select();
        if (inserted) liveRows = [...liveRows, ...(inserted as RowExt[])];
      }

      setColumns(liveColumns);
      setRows(liveRows);

      const map = new Map<string, NomenclatureCell>();
      for (const cell of (cellsData as NomenclatureCell[]) ?? []) {
        map.set(cellKey(cell.row_id, cell.column_id), cell);
      }
      setCells(map);
    } catch (err) {
      console.error("[CostingModal] load error", err);
      setError(t("etude.costing.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [pieceIds, staffUser, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Mise à jour d'une cellule (upsert sur la contrainte unique) */
  async function updateCell(rowId: string, columnId: string, value: string) {
    if (!staffUser || !studyId) return;
    const key = cellKey(rowId, columnId);
    const existing = cells.get(key);
    setCells((prev) =>
      new Map(prev).set(key, {
        ...(existing as NomenclatureCell),
        row_id: rowId,
        column_id: columnId,
        value_text: value,
      })
    );
    const { data } = await supabase
      .from("nomenclature_cells")
      .upsert(
        {
          nomenclature_id: studyId,
          row_id: rowId,
          column_id: columnId,
          company_id: staffUser.company_id,
          value_text: value,
        },
        { onConflict: "row_id,column_id" }
      )
      .select()
      .single();
    if (data) setCells((prev) => new Map(prev).set(key, data as NomenclatureCell));
  }

  /** Coût d'une cellule : opération tarifée → heures × prix ; colonne Σ → valeur brute */
  function cellCost(rowId: string, col: ColumnExt): number {
    const raw = cells.get(cellKey(rowId, col.id))?.value_text;
    const num = raw ? parseFloat(raw) : 0;
    if (isNaN(num)) return 0;
    if (col.column_type === "operation" && col.hourly_rate) return num * col.hourly_rate;
    if (col.is_total_column) return num;
    return 0;
  }

  function rowTotal(rowId: string): number {
    return columns.reduce((sum, col) => sum + cellCost(rowId, col), 0);
  }

  const liveTotal = useMemo(
    () => rows.reduce((sum, row) => sum + rowTotal(row.id), 0),
    [rows, columns, cells]
  );

  /** Sauvegarder : enregistre le total, garde le statut en_attente */
  async function handleSave() {
    if (!studyId) return;
    setIsSaving(true);
    try {
      await supabase
        .from("nomenclatures")
        .update({ total_estimated_cost: liveTotal, status: "en_attente" })
        .eq("id", studyId);
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  /** Confirmer : passe à valide → la pièce devient disponible dans OF */
  async function handleConfirm() {
    if (!studyId || !staffUser) return;
    setIsSaving(true);
    try {
      await supabase
        .from("nomenclatures")
        .update({
          total_estimated_cost: liveTotal,
          status: "valide",
          validated_at: new Date().toISOString(),
          validated_by: staffUser.id,
        })
        .eq("id", studyId);
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">
            {t("etude.costing.modalTitle", { count: pieceIds.length })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-slate-400">{t("common.loading")}</div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              {t("etude.costing.noRows")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80">
                    <th className="min-w-[180px] px-3 py-2.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {t("setup.piece")}
                    </th>
                    {columns.map((col) => (
                      <th key={col.id} className="min-w-[140px] px-3 py-2.5 text-start">
                        <div className="text-xs font-bold text-slate-700">{col.name}</div>
                        {col.column_type === "operation" && col.hourly_rate ? (
                          <div className="text-[10px] font-normal text-slate-400" dir="ltr">
                            {col.hourly_rate} / h
                          </div>
                        ) : null}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {t("setup.rowTotalCost")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-slate-700">{row.row_label ?? "—"}</span>
                      </td>
                      {columns.map((col) => (
                        <td key={col.id} className="px-3 py-2.5">
                          <input
                            value={cells.get(cellKey(row.id, col.id))?.value_text ?? ""}
                            onChange={(e) => void updateCell(row.id, col.id, e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                            dir={
                              ["number", "value", "operation", "currency"].includes(col.column_type)
                                ? "ltr"
                                : undefined
                            }
                          />
                          {col.column_type === "operation" && col.hourly_rate ? (
                            <div className="mt-0.5 text-[10px] text-slate-400" dir="ltr">
                              {cellCost(row.id, col).toFixed(2)}
                            </div>
                          ) : null}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-left font-bold text-slate-700" dir="ltr">
                        {rowTotal(row.id).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div>
            <div className="text-xs text-slate-400">{t("setup.liveTotal")}</div>
            <div className="text-xl font-bold text-slate-800" dir="ltr">
              {liveTotal.toFixed(2)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || isLoading || !!error}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {t("etude.costing.save")}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isSaving || isLoading || !!error}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {t("etude.costing.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}