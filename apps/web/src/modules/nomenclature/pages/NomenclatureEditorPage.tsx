import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock3 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type {
  Nomenclature,
  NomenclatureColumn,
  NomenclatureRow,
  NomenclatureCell,
  NomenclatureColumnType,
  PieceTask,
} from "../../../shared/types/database";

/** أعمدة/أسطر/دراسة ممتدة بالحقول المضافة عبر migration 0053، غير موجودة
 * بعد في النوع المولّد تلقائياً من Supabase */
type ColumnExt = NomenclatureColumn & { hourly_rate: number | null };
type RowExt = NomenclatureRow & { piece_task_id: string | null };
type NomenclatureExt = Nomenclature & {
  status: "en_attente" | "valide";
  validated_at: string | null;
};

interface NomenclatureEditorPageProps {
  nomenclature: Nomenclature;
  onBack: () => void;
}

const COLUMN_TYPE_LABEL_KEYS: Record<NomenclatureColumnType, string> = {
  material: "setup.colMaterial",
  unit: "setup.colUnit",
  currency: "setup.colCurrency",
  value: "setup.colValue",
  name: "setup.colName",
  operation: "setup.colOperation",
  text: "setup.colText",
  number: "setup.colNumber",
  boolean: "setup.colBoolean",
  date: "setup.colDate",
  select: "setup.colSelect",
  formula: "setup.colFormula",
};

export function NomenclatureEditorPage({ nomenclature, onBack }: NomenclatureEditorPageProps) {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [study, setStudy] = useState<NomenclatureExt>(nomenclature as NomenclatureExt);
  const [columns, setColumns] = useState<ColumnExt[]>([]);
  const [rows, setRows] = useState<RowExt[]>([]);
  const [cells, setCells] = useState<Map<string, NomenclatureCell>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [savedTotal, setSavedTotal] = useState(nomenclature.total_estimated_cost);
  const [pieceEstimates, setPieceEstimates] = useState<Map<string, number>>(new Map());

  const cellKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`;

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [{ data: cols }, { data: rowsData }, { data: cellsData }] = await Promise.all([
      supabase.from("nomenclature_columns").select("*").eq("nomenclature_id", nomenclature.id).order("sequence_order"),
      supabase.from("nomenclature_rows").select("*").eq("nomenclature_id", nomenclature.id).order("sequence_order"),
      supabase.from("nomenclature_cells").select("*").eq("nomenclature_id", nomenclature.id),
    ]);

    let liveColumns = (cols as ColumnExt[]) ?? [];
    let liveRows = (rowsData as RowExt[]) ?? [];

    // أول مرة يُفتح فيها study جديدة بلا أعمدة إطلاقاً: نستنسخ أعمدة آخر
    // دراسة بها أعمدة في نفس الشركة — بهذا "الجدول" الذي يضعه مسؤول قسم
    // الدراسات مرة واحدة يُطبَّق تلقائياً على كل مشروع جديد بعده
    if (liveColumns.length === 0) {
      const { data: templateNom } = await supabase
        .from("nomenclatures")
        .select("id")
        .eq("company_id", nomenclature.company_id)
        .neq("id", nomenclature.id)
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
            nomenclature_id: nomenclature.id,
            company_id: nomenclature.company_id,
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

    setColumns(liveColumns);

    // مزامنة: أي قطعة أُضيفت للمشروع لاحقاً (بعد إنشاء هذه الدراسة) ولم
    // تُستورد بعد كسطر — تُستورد الآن تلقائياً، حتى لا يفوت أي تحديث
    if (nomenclature.project_id) {
      const { data: pieces } = await supabase
        .from("pieces_tasks")
        .select("id, name, estimated_time_minutes, sequence_order")
        .eq("project_id", nomenclature.project_id)
        .order("sequence_order");

      const importedPieceIds = new Set(liveRows.map((r) => r.piece_task_id).filter(Boolean));
      const missing = ((pieces as PieceTask[]) ?? []).filter((p) => !importedPieceIds.has(p.id));

      if (missing.length > 0) {
        const inserts = missing.map((p, i) => ({
          nomenclature_id: nomenclature.id,
          company_id: nomenclature.company_id,
          row_label: p.name,
          piece_task_id: p.id,
          sequence_order: liveRows.length + i,
        }));
        // upsert مع تجاهل التكرار بدل insert: يحمي من فشل 409 Conflict إذا
        // نُفِّذت هذه الدالة مرتين بالتوازي (مثلاً إعادة تركيب المكوّن في
        // وضع التطوير) وحاولتا استيراد نفس القطعة في آن واحد
        const { data: inserted } = await supabase
          .from("nomenclature_rows")
          .upsert(inserts, { onConflict: "nomenclature_id,piece_task_id", ignoreDuplicates: true })
          .select();
        if (inserted) liveRows = [...liveRows, ...(inserted as RowExt[])];
      }

      const estimates = new Map<string, number>();
      for (const p of (pieces as PieceTask[]) ?? []) {
        if (p.estimated_time_minutes) estimates.set(p.id, p.estimated_time_minutes);
      }
      setPieceEstimates(estimates);
    }

    setRows(liveRows);

    const cellMap = new Map<string, NomenclatureCell>();
    for (const cell of (cellsData as NomenclatureCell[]) ?? []) {
      cellMap.set(cellKey(cell.row_id, cell.column_id), cell);
    }
    setCells(cellMap);
    setIsLoading(false);
  }, [nomenclature.id, nomenclature.project_id, nomenclature.company_id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function addColumn() {
    if (!staffUser) return;
    const { data } = await supabase
      .from("nomenclature_columns")
      .insert({
        nomenclature_id: nomenclature.id,
        company_id: staffUser.company_id,
        name: t("setup.newColumn"),
        column_type: "operation",
        sequence_order: columns.length,
      })
      .select()
      .single();
    if (data) setColumns((prev) => [...prev, data as ColumnExt]);
  }

  async function updateColumn(columnId: string, patch: Partial<ColumnExt>) {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, ...patch } : c)));
    await supabase.from("nomenclature_columns").update(patch).eq("id", columnId);
  }

  async function deleteColumn(columnId: string) {
    await supabase.from("nomenclature_columns").delete().eq("id", columnId);
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
  }

  async function deleteRow(rowId: string) {
    await supabase.from("nomenclature_rows").delete().eq("id", rowId);
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  async function updateCell(rowId: string, columnId: string, value: string) {
    if (!staffUser) return;
    const key = cellKey(rowId, columnId);
    const existing = cells.get(key);

    // تحديث تفاؤلي فوري للعرض أثناء الكتابة
    setCells((prev) => new Map(prev).set(key, { ...(existing as NomenclatureCell), row_id: rowId, column_id: columnId, value_text: value }));

    // upsert على القيد الفريد (row_id, column_id) بدل التمييز بين إدراج/تعديل
    // يدوياً: الطريقة القديمة كانت تعتمد على "هل توجد خلية محلياً بمعرّف
    // حقيقي؟" وهو ما يفشل عند كتابة أحرف متتالية بسرعة قبل اكتمال أول
    // إدراج (السطر الثاني يجد كائناً تفاؤلياً بلا id فيحاول PATCH بمعرّف
    // فارغ → 400 Bad Request). upsert يتجنب هذا السباق كلياً.
    const { data } = await supabase
      .from("nomenclature_cells")
      .upsert(
        { nomenclature_id: nomenclature.id, row_id: rowId, column_id: columnId, company_id: staffUser.company_id, value_text: value },
        { onConflict: "row_id,column_id" }
      )
      .select()
      .single();
    if (data) setCells((prev) => new Map(prev).set(key, data as NomenclatureCell));
  }

  /** تكلفة خلية واحدة: عمود "عملية" بسعر ساعة محدد → ساعات×سعر، وإلا القيمة
   * الخام إذا كان العمود معلَّماً كعمود مجموع (Σ) بطريقة يدوية */
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

  const liveTotal = rows.reduce((sum, row) => sum + rowTotal(row.id), 0);

  async function saveEstimate() {
    await supabase.from("nomenclatures").update({ total_estimated_cost: liveTotal }).eq("id", nomenclature.id);
    setSavedTotal(liveTotal);
  }

  async function setStatus(status: "en_attente" | "valide") {
    const patch: Record<string, unknown> = { status };
    if (status === "valide") {
      patch.validated_at = new Date().toISOString();
      patch.validated_by = staffUser?.id ?? null;
    }
    await supabase.from("nomenclatures").update(patch).eq("id", nomenclature.id);
    setStudy((prev) => ({ ...prev, status, validated_at: (patch.validated_at as string) ?? prev.validated_at }));
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">{t("setup.loadingSimple")}</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="text-sm font-semibold text-blue-600">
          {t("setup.backToList")}
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-800">{nomenclature.name}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              study.status === "valide" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {study.status === "valide" ? t("setup.nomenclatureValide") : t("setup.nomenclatureEnAttente")}
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={addColumn} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">
          {t("setup.addOperationColumn")}
        </button>
        <span className="self-center text-xs text-slate-400">{t("setup.rowsAutoImportedHint")}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50/80">
              <th className="min-w-[180px] px-3 py-2.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("setup.piece")}</th>
              {columns.map((col) => (
                <th key={col.id} className="min-w-[150px] px-3 py-2.5 text-start">
                  <input
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                    className="mb-1 w-full border-b border-transparent bg-transparent text-xs font-bold text-slate-700 focus:border-blue-400 focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      value={col.column_type}
                      onChange={(e) => updateColumn(col.id, { column_type: e.target.value as NomenclatureColumnType })}
                      className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
                    >
                      {Object.entries(COLUMN_TYPE_LABEL_KEYS).map(([value, labelKey]) => (
                        <option key={value} value={value}>
                          {t(labelKey)}
                        </option>
                      ))}
                    </select>
                    {col.column_type === "operation" ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-slate-400" dir="ltr" title={t("setup.hourlyRateHint")}>
                        <input
                          type="number"
                          min="0"
                          value={col.hourly_rate ?? ""}
                          onChange={(e) => updateColumn(col.id, { hourly_rate: e.target.value ? Number(e.target.value) : null })}
                          placeholder={t("setup.hourlyRate")}
                          className="w-14 rounded border border-slate-200 px-1 py-0.5"
                        />
                        /h
                      </span>
                    ) : (
                      <label className="flex items-center gap-0.5 text-[10px] text-slate-400" title={t("setup.sumHint")}>
                        <input
                          type="checkbox"
                          checked={col.is_total_column}
                          onChange={(e) => updateColumn(col.id, { is_total_column: e.target.checked })}
                        />
                        Σ
                      </label>
                    )}
                    <button onClick={() => deleteColumn(col.id)} className="text-[10px] text-red-400">
                      ✕
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("setup.rowTotalCost")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">{row.row_label ?? "—"}</span>
                    <button onClick={() => deleteRow(row.id)} className="text-[10px] text-red-400">
                      ✕
                    </button>
                  </div>
                  {row.piece_task_id && pieceEstimates.has(row.piece_task_id) && (
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400" title={t("setup.cncEstimateReminder")}>
                      <Clock3 size={10} />
                      {t("setup.pieceCncEstimateShort")}: {Math.floor((pieceEstimates.get(row.piece_task_id) ?? 0) / 60)}h{" "}
                      {(pieceEstimates.get(row.piece_task_id) ?? 0) % 60}min
                    </span>
                  )}
                </td>
                {columns.map((col) => (
                  <td key={col.id} className="px-3 py-2.5">
                    <input
                      value={cells.get(cellKey(row.id, col.id))?.value_text ?? ""}
                      onChange={(e) => void updateCell(row.id, col.id, e.target.value)}
                      placeholder={col.column_type === "operation" ? t("setup.hoursShort") : ""}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      dir={["number", "value", "operation", "currency"].includes(col.column_type) ? "ltr" : undefined}
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="p-4 text-center text-sm text-slate-400">
                  {t("setup.startByAdding")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <div className="text-xs text-slate-400">{t("setup.liveTotal")}</div>
          <div className="text-xl font-bold text-slate-800" dir="ltr">
            {liveTotal.toFixed(2)}
          </div>
          {savedTotal !== null && (
            <div className="mt-1 text-xs text-slate-400">
              {t("setup.lastSavedTotal")}: <span dir="ltr">{savedTotal.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={saveEstimate} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">
            {t("setup.saveEstimate")}
          </button>
          {study.status !== "valide" && (
            <button onClick={() => void setStatus("en_attente")} className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100">
              {t("setup.nomenclatureEnAttente")}
            </button>
          )}
          <button
            onClick={() => void setStatus("valide")}
            disabled={study.status === "valide"}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <CheckCircle2 size={15} /> {t("setup.nomenclatureValider")}
          </button>
        </div>
      </div>
      {study.validated_at && (
        <p className="mt-2 text-end text-xs text-slate-400" dir="ltr">
          {t("setup.validatedOn")}: {new Date(study.validated_at).toLocaleString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
