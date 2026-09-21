import { useEffect, useState, useCallback, useRef, useMemo, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock3, RotateCcw, Sigma, Star } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { buildDefaultColumnsInserts } from "../defaults/defaultTemplate";
import type { ProductionStage } from "../defaults/defaultTemplate";
import type {
  Nomenclature,
  NomenclatureColumn,
  NomenclatureRow,
  NomenclatureCell,
  NomenclatureColumnType,
  PieceTask,
} from "../../../shared/types/database";

/** NomenclatureColumn (type généré Supabase) définit `column_type` comme
 * `string` (colonne text). En pratique, la migration 0055 a aligné le CHECK
 * côté base sur les 12 valeurs officielles de `NomenclatureColumnType`. On
 * force donc ce champ au type union ici pour bénéficier de la vérification
 * TypeScript dans `handleCellKeyDown` et `NUMERIC_COLUMN_TYPES.has()`, sans
 * avoir à caster `col.column_type` à chaque utilisation. */
type ColumnExt = Omit<NomenclatureColumn, "column_type"> & {
  column_type: NomenclatureColumnType;
  hourly_rate: number | null;
  stage: ProductionStage | null;
};
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

/** Types numériques : navigation clavier ←/→ active (le curseur texte reste
 * disponible pour les champs libres comme "Matière" ou "Article/pièce"). */
const NUMERIC_COLUMN_TYPES = new Set<NomenclatureColumnType>(["number", "operation", "value", "currency"]);

const STAGE_ORDER: ProductionStage[] = ["usinage_cnc", "tournage", "ajustage", "stt", "anodisation"];

const STAGE_META: Record<ProductionStage, {
  labelKey: string;
  border: string;
  headerBg: string;
  cellBg: string;
  chip: string;
  dot: string;
  cardFrom: string;
  cardTo: string;
}> = {
  usinage_cnc: {
    labelKey: "setup.stageUsinageCnc",
    border: "border-s-4 border-amber-400",
    headerBg: "bg-amber-50/80",
    cellBg: "bg-amber-50/40",
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    cardFrom: "from-amber-500",
    cardTo: "to-orange-600",
  },
  tournage: {
    labelKey: "setup.stageTournage",
    border: "border-s-4 border-sky-400",
    headerBg: "bg-sky-50/80",
    cellBg: "bg-sky-50/40",
    chip: "bg-sky-100 text-sky-800",
    dot: "bg-sky-500",
    cardFrom: "from-sky-500",
    cardTo: "to-blue-600",
  },
  ajustage: {
    labelKey: "setup.stageAjustage",
    border: "border-s-4 border-violet-400",
    headerBg: "bg-violet-50/80",
    cellBg: "bg-violet-50/40",
    chip: "bg-violet-100 text-violet-800",
    dot: "bg-violet-500",
    cardFrom: "from-violet-500",
    cardTo: "to-purple-600",
  },
  stt: {
    labelKey: "setup.stageStt",
    border: "border-s-4 border-teal-400",
    headerBg: "bg-teal-50/80",
    cellBg: "bg-teal-50/40",
    chip: "bg-teal-100 text-teal-800",
    dot: "bg-teal-500",
    cardFrom: "from-teal-500",
    cardTo: "to-emerald-600",
  },
  anodisation: {
    labelKey: "setup.stageAnodisation",
    border: "border-s-4 border-fuchsia-400",
    headerBg: "bg-fuchsia-50/80",
    cellBg: "bg-fuchsia-50/40",
    chip: "bg-fuchsia-100 text-fuchsia-800",
    dot: "bg-fuchsia-500",
    cardFrom: "from-fuchsia-500",
    cardTo: "to-pink-600",
  },
};

export function NomenclatureEditorPage({ nomenclature, onBack }: NomenclatureEditorPageProps) {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [study, setStudy] = useState<NomenclatureExt>(nomenclature as NomenclatureExt);
  const [columns, setColumns] = useState<ColumnExt[]>([]);
  const [rows, setRows] = useState<RowExt[]>([]);
  const [cells, setCells] = useState<Map<string, NomenclatureCell>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedTotal, setSavedTotal] = useState(nomenclature.total_estimated_cost);
  const [pieceEstimates, setPieceEstimates] = useState<Map<string, number>>(new Map());
  const [lastCncSync, setLastCncSync] = useState<number>(0);

  /** فلتر مجموعة الأعمدة المعروضة — يحل مشكلة اتساع الجدول (25 عمود لا تتسع
   * في شاشة واحدة) بعرض مرحلة واحدة في كل مرة (تبويبات بنفس شكل قسم rapports)
   * بدل فرض تمرير أفقي دائم. "الكل" يبقى متاحاً لمن يريد رؤية شاملة. */
  const [visibleGroup, setVisibleGroup] = useState<"all" | ProductionStage | "other">("all");
  const [groupInitialized, setGroupInitialized] = useState(false);

  const cellKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`;

  /** Grille de références pour la navigation clavier type tableur. */
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const setCellRef = (rowIdx: number, colIdx: number, el: HTMLInputElement | null) => {
    const key = `${rowIdx}:${colIdx}`;
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };
  const focusCell = (rowIdx: number, colIdx: number) => {
    cellRefs.current.get(`${rowIdx}:${colIdx}`)?.focus();
  };
  /** Déplace le focus. `wrap` = true pour Tab (passe à la ligne suivante en
   * dépassant la dernière colonne) ; false pour ↑/↓/Entrée (mouvement vertical pur). */
  const moveFocus = (rowIdx: number, colIdx: number, dRow: number, dCol: number, wrap: boolean) => {
    let r = rowIdx + dRow;
    let c = colIdx + dCol;
    if (wrap) {
      if (c >= visibleColumns.length) { c = 0; r += 1; }
      else if (c < 0) { c = visibleColumns.length - 1; r -= 1; }
    }
    r = Math.max(0, Math.min(rows.length - 1, r));
    c = Math.max(0, Math.min(visibleColumns.length - 1, c));
    focusCell(r, c);
  };
  function handleCellKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number, colType: NomenclatureColumnType) {
    if (e.key === "Tab") {
      e.preventDefault();
      moveFocus(rowIdx, colIdx, 0, e.shiftKey ? -1 : 1, true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      moveFocus(rowIdx, colIdx, 1, 0, false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(rowIdx, colIdx, 1, 0, false);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(rowIdx, colIdx, -1, 0, false);
    } else if (e.key === "ArrowRight" && NUMERIC_COLUMN_TYPES.has(colType)) {
      e.preventDefault();
      moveFocus(rowIdx, colIdx, 0, 1, false);
    } else if (e.key === "ArrowLeft" && NUMERIC_COLUMN_TYPES.has(colType)) {
      e.preventDefault();
      moveFocus(rowIdx, colIdx, 0, -1, false);
    }
  }

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [{ data: cols }, { data: rowsData }, { data: cellsData }] = await Promise.all([
      supabase.from("nomenclature_columns").select("*").eq("nomenclature_id", nomenclature.id).order("sequence_order"),
      supabase.from("nomenclature_rows").select("*").eq("nomenclature_id", nomenclature.id).order("sequence_order"),
      supabase.from("nomenclature_cells").select("*").eq("nomenclature_id", nomenclature.id),
    ]);

    // Supabase retourne column_type: string. On force le type union ici à la
    // frontière (voir ColumnExt ci-dessus pour le contexte).
    let liveColumns = ((cols ?? []) as unknown) as ColumnExt[];
    let liveRows = (rowsData as RowExt[]) ?? [];

    // أول مرة يُفتح فيها study جديدة بلا أعمدة إطلاقاً: نستنسخ أعمدة آخر
    // دراسة بها أعمدة في نفس الشركة — بهذا "الجدول" الذي يضعه مسؤول قسم
    // الدراسات مرة واحدة يُطبَّق تلقائياً على كل مشروع جديد بعده.
    // Si aucune étude précédente n'existe (base fraîchement réinitialisée),
    // on sème le modèle standard issu du fichier Excel du client.
    if (liveColumns.length === 0) {
      const { data: templateNom } = await supabase
        .from("nomenclatures")
        .select("id")
        .eq("company_id", nomenclature.company_id)
        .neq("id", nomenclature.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let cloned = false;
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
            is_total_column: c.is_total_column,
            stage: c.stage,
            sequence_order: c.sequence_order,
          }));
          liveColumns = await insertColumnsWithFallback(clones);
          cloned = liveColumns.length > 0;
        }
      }

      // Aucune étude modèle disponible → semer le modèle standard du client
      if (!cloned) {
        const inserts = buildDefaultColumnsInserts(nomenclature.id, nomenclature.company_id);
        liveColumns = await insertColumnsWithFallback(inserts);
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

  // بمجرد تحميل الأعمدة أول مرة: نبدأ تلقائياً بعرض مرحلة "usinage CNC" وحدها
  // (المرحلة المحورية) بدل "الكل" — هذا يضمن أن الجدول يظهر كاملاً بلا تمرير
  // أفقي من أول لحظة فتح الصفحة، مع بقاء "الكل" تبويباً متاحاً بضغطة واحدة.
  useEffect(() => {
    if (groupInitialized || columns.length === 0) return;
    const hasCnc = columns.some((c) => c.stage === "usinage_cnc");
    setVisibleGroup(hasCnc ? "usinage_cnc" : "all");
    setGroupInitialized(true);
  }, [columns, groupInitialized]);

  const groupTabs = useMemo(() => {
    const tabs: Array<{ key: "all" | ProductionStage | "other"; label: string; count: number }> = [
      { key: "all", label: t("setup.groupAll"), count: columns.length },
    ];
    for (const s of STAGE_ORDER) {
      const count = columns.filter((c) => c.stage === s).length;
      if (count > 0) tabs.push({ key: s, label: t(STAGE_META[s].labelKey), count });
    }
    const otherCount = columns.filter((c) => !c.stage).length;
    if (otherCount > 0) tabs.push({ key: "other", label: t("setup.groupOther"), count: otherCount });
    return tabs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  /** الأعمدة المعروضة فعلياً في الجدول حسب التبويب المختار — أما الإجماليات
   * (rowTotal/liveTotal/stageBreakdown) فتُحسب دوماً من `columns` كاملة، بلا
   * تأثر بالفلتر، فهي أرقام محاسبية لا عرضاً بصرياً. */
  const visibleColumns = useMemo(() => {
    if (visibleGroup === "all") return columns;
    if (visibleGroup === "other") return columns.filter((c) => !c.stage);
    return columns.filter((c) => c.stage === visibleGroup);
  }, [columns, visibleGroup]);

  /**
   * Insertion résiliente d'un lot de colonnes : `stage` (migration 0055) peut
   * ne pas être encore connu du cache PostgREST tout juste après le déploiement
   * de la migration. On retente sans ce champ plutôt que d'échouer entièrement
   * (comportement observé auparavant avec `hourly_rate`, voir migration 0053).
   */
  async function insertColumnsWithFallback(
    inserts: Array<Record<string, unknown>>
  ): Promise<ColumnExt[]> {
    const { data, error } = await supabase.from("nomenclature_columns").insert(inserts as never).select();
    if (data) return (data as unknown) as ColumnExt[];
    if (error) {
      console.warn("[insertColumns] tentative sans `stage` après échec :", error.message);
      const withoutStage = inserts.map(({ stage: _stage, ...rest }) => rest);
      const { data: retryData, error: retryError } = await supabase
        .from("nomenclature_columns")
        .insert(withoutStage as never)
        .select();
      if (retryData) return (retryData as unknown) as ColumnExt[];
      if (retryError) console.error("[insertColumns] échec définitif :", retryError.message);
    }
    return [];
  }

  async function addColumn() {
    if (!staffUser) return;
    // إن كان تبويب مرحلة محدّدة نشطاً، نُلحق العمود الجديد بنفس المرحلة تلقائياً
    // — وإلا سيُضاف العمود بنجاح لكنه يختفي فوراً عن العرض الحالي المُفلتر
    const stageForNewColumn = visibleGroup !== "all" && visibleGroup !== "other" ? visibleGroup : null;
    const { data, error } = await supabase
      .from("nomenclature_columns")
      .insert({
        nomenclature_id: nomenclature.id,
        company_id: staffUser.company_id,
        name: t("setup.newColumn"),
        column_type: "operation",
        stage: stageForNewColumn,
        sequence_order: columns.length,
      } as never)
      .select()
      .single();
    if (data) {
      setColumns((prev) => [...prev, (data as unknown) as ColumnExt]);
      return;
    }
    if (error && stageForNewColumn) {
      // retente sans `stage` (voir insertColumnsWithFallback pour le contexte)
      const { data: retryData } = await supabase
        .from("nomenclature_columns")
        .insert({
          nomenclature_id: nomenclature.id,
          company_id: staffUser.company_id,
          name: t("setup.newColumn"),
          column_type: "operation",
          sequence_order: columns.length,
        } as never)
        .select()
        .single();
      if (retryData) setColumns((prev) => [...prev, (retryData as unknown) as ColumnExt]);
    }
  }

  /**
   * Mise à jour d'une colonne. Si le patch contient `hourly_rate` et/ou
   * `stage` et que PostgREST rejette l'opération (cache obsolète), on retente
   * sans ces deux champs pour ne pas bloquer les autres modifications.
   */
  async function updateColumn(columnId: string, patch: Partial<ColumnExt>) {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, ...patch } : c)));

    const { error } = await supabase.from("nomenclature_columns").update(patch).eq("id", columnId);
    if (error && ("hourly_rate" in patch || "stage" in patch)) {
      const { hourly_rate, stage, ...rest } = patch;
      void hourly_rate; void stage; // ignorés intentionnellement pour cette tentative
      await supabase.from("nomenclature_columns").update(rest).eq("id", columnId);
      console.warn(
        "[updateColumn] hourly_rate/stage ignorés (cache PostgREST obsolète). " +
          "Exécutez les migrations 0053/0055 ou rechargez PostgREST pour les activer."
      );
    }
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

  /**
   * Réinitialise la grille au modèle standard du client (fichier Excel
   * nomenclature.xlsx). Supprime toutes les colonnes actuelles de l'étude
   * et les remplace par les colonnes standard (avec étapes de production
   * pré-taguées), en conservant les lignes (pièces) et les cellules.
   */
  async function resetToDefaultTemplate() {
    if (!staffUser) return;
    if (!window.confirm(t("setup.confirmResetTemplate"))) return;

    setIsResetting(true);
    try {
      // Supprimer toutes les colonnes actuelles
      await supabase.from("nomenclature_columns").delete().eq("nomenclature_id", nomenclature.id);

      // Insérer le modèle standard
      const inserts = buildDefaultColumnsInserts(nomenclature.id, staffUser.company_id);
      const inserted = await insertColumnsWithFallback(inserts);
      setColumns(inserted);
    } finally {
      setIsResetting(false);
    }
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

  /**
   * Récapitulatif par étape de production : pour chacune des 5 étapes
   * (usinage CNC, tournage, ajustage, STT, anodisation), somme des heures
   * (colonnes "opération" uniquement) et du coût (toutes colonnes taguées),
   * tous rangs confondus. Base de la mise en évidence visuelle et du calcul
   * « logique » demandé : coût étape = Σ(heures × prix/h) par colonne, puis
   * coût total production = Σ des 5 coûts d'étape.
   */
  const stageBreakdown = useMemo(() => {
    const result: Record<ProductionStage, { hours: number; cost: number; hasHours: boolean }> = {
      usinage_cnc: { hours: 0, cost: 0, hasHours: false },
      tournage: { hours: 0, cost: 0, hasHours: false },
      ajustage: { hours: 0, cost: 0, hasHours: false },
      stt: { hours: 0, cost: 0, hasHours: false },
      anodisation: { hours: 0, cost: 0, hasHours: false },
    };
    for (const col of columns) {
      if (!col.stage) continue;
      const bucket = result[col.stage];
      if (col.column_type === "operation") bucket.hasHours = true;
      for (const row of rows) {
        const raw = cells.get(cellKey(row.id, col.id))?.value_text;
        const num = raw ? parseFloat(raw) : 0;
        if (isNaN(num)) continue;
        if (col.column_type === "operation") bucket.hours += num;
        bucket.cost += cellCost(row.id, col);
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, rows, cells]);

  const stageGrandTotal = STAGE_ORDER.reduce((sum, s) => sum + stageBreakdown[s].cost, 0);

  /**
   * Étape PIVOT : Usinage CNC. Répercute automatiquement les heures/coût CNC
   * de chaque pièce de la grille vers pieces_tasks (cnc_estimated_hours,
   * cnc_estimated_cost, et estimated_time_minutes déjà utilisé partout dans
   * l'app : Kiosk, sélecteur de pièces, rapport projet, archives...). Appelé
   * à chaque enregistrement et à la validation — best-effort, ne doit jamais
   * bloquer l'action principale de sauvegarde en cas d'échec.
   */
  async function syncCncEstimatesToPieces() {
    const cncColumns = columns.filter((c) => c.stage === "usinage_cnc" && c.column_type === "operation");
    if (cncColumns.length === 0) return;

    const updates: Array<{ id: string; hours: number; cost: number }> = [];
    for (const row of rows) {
      if (!row.piece_task_id) continue;
      let hours = 0;
      let cost = 0;
      for (const col of cncColumns) {
        const raw = cells.get(cellKey(row.id, col.id))?.value_text;
        const num = raw ? parseFloat(raw) : 0;
        if (isNaN(num)) continue;
        hours += num;
        cost += col.hourly_rate ? num * col.hourly_rate : 0;
      }
      if (hours > 0) updates.push({ id: row.piece_task_id, hours, cost });
    }
    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map((u) =>
          supabase
            .from("pieces_tasks")
            .update({
              cnc_estimated_hours: u.hours,
              cnc_estimated_cost: u.cost,
              estimated_time_minutes: Math.round(u.hours * 60),
            } as never)
            .eq("id", u.id)
        )
      );
      setLastCncSync(updates.length);
    } catch (err) {
      console.warn("[syncCncEstimatesToPieces] échec best-effort :", err);
    }
  }

  async function saveEstimate() {
    setIsSaving(true);
    try {
      await supabase.from("nomenclatures").update({ total_estimated_cost: liveTotal }).eq("id", nomenclature.id);
      setSavedTotal(liveTotal);
      await syncCncEstimatesToPieces();
    } finally {
      setIsSaving(false);
    }
  }

  async function setStatus(status: "en_attente" | "valide") {
    const patch: Record<string, unknown> = { status };
    if (status === "valide") {
      patch.validated_at = new Date().toISOString();
      patch.validated_by = staffUser?.id ?? null;
    }
    await supabase.from("nomenclatures").update(patch).eq("id", nomenclature.id);
    setStudy((prev) => ({ ...prev, status, validated_at: (patch.validated_at as string) ?? prev.validated_at }));
    if (status === "valide") await syncCncEstimatesToPieces();
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={addColumn} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">
          {t("setup.addOperationColumn")}
        </button>
        <button
          onClick={() => void resetToDefaultTemplate()}
          disabled={isResetting}
          className="flex items-center gap-1.5 rounded bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-50"
          title={t("setup.resetTemplateHint")}
        >
          <RotateCcw size={14} />
          {t("setup.resetTemplate")}
        </button>
        <span className="self-center text-xs text-slate-400">{t("setup.rowsAutoImportedHint")}</span>
      </div>
      <p className="mb-3 text-[11px] text-slate-400">{t("setup.keyboardNavHint")}</p>

      {/* تبويبات فلترة الأعمدة — تحل مشكلة اتساع الجدول (25 عموداً) بعرض
          مرحلة واحدة كاملة دون تمرير أفقي، بنفس شكل تبويبات قسم rapports */}
      <div className="mb-1 flex gap-2 overflow-x-auto border-b border-slate-200">
        {groupTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setVisibleGroup(tab.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold ${
              visibleGroup === tab.key ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
            }`}
          >
            {tab.label} <span className="text-xs text-slate-300">({tab.count})</span>
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-slate-400">{t("setup.groupFilterHint")}</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50/80">
              <th className="min-w-[150px] px-3 py-2.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("setup.piece")}</th>
              {visibleColumns.map((col) => {
                const meta = col.stage ? STAGE_META[col.stage] : null;
                return (
                <th
                  key={col.id}
                  className={`min-w-[135px] px-3 py-2.5 text-start align-top ${meta ? `${meta.border} ${meta.headerBg}` : col.is_total_column ? "bg-emerald-50/50" : ""}`}
                >
                  <div className="mb-1 flex items-center gap-1">
                    <input
                      value={col.name}
                      onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                      className="w-full border-b border-transparent bg-transparent text-xs font-bold text-slate-700 focus:border-blue-400 focus:outline-none"
                    />
                    {col.column_type === "operation" && <Clock3 size={11} className="shrink-0 text-slate-400" />}
                    {col.is_total_column && <Sigma size={11} className="shrink-0 text-emerald-600" />}
                  </div>
                  {meta && (
                    <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.chip}`}>
                      {col.stage === "usinage_cnc" && <Star size={9} />}
                      {t(meta.labelKey)}
                    </span>
                  )}
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
                    <select
                      value={col.stage ?? ""}
                      onChange={(e) => updateColumn(col.id, { stage: (e.target.value || null) as ProductionStage | null })}
                      className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
                      title={t("setup.stageLabel")}
                    >
                      <option value="">{t("setup.stageNone")}</option>
                      {STAGE_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {t(STAGE_META[s].labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
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
              );})}
              <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("setup.rowTotalCost")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
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
                {visibleColumns.map((col, colIdx) => {
                  const meta = col.stage ? STAGE_META[col.stage] : null;
                  return (
                  <td key={col.id} className={`px-3 py-2.5 ${meta ? meta.cellBg : col.is_total_column ? "bg-emerald-50/30" : ""}`}>
                    <input
                      ref={(el) => setCellRef(rowIdx, colIdx, el)}
                      value={cells.get(cellKey(row.id, col.id))?.value_text ?? ""}
                      onChange={(e) => void updateCell(row.id, col.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx, col.column_type)}
                      placeholder={col.column_type === "operation" ? t("setup.hoursShort") : ""}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      dir={NUMERIC_COLUMN_TYPES.has(col.column_type) ? "ltr" : undefined}
                    />
                    {col.column_type === "operation" && col.hourly_rate ? (
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-400" dir="ltr">
                        {cellCost(row.id, col).toFixed(2)}
                      </div>
                    ) : null}
                  </td>
                );})}
                <td className="px-3 py-2.5 text-left font-bold text-slate-700" dir="ltr">
                  {rowTotal(row.id).toFixed(2)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="p-4 text-center text-sm text-slate-400">
                  {t("setup.startByAdding")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Récapitulatif par étape de production : coût = Σ(heures × prix/h) par
          colonne d'étape, puis coût total = Σ des 5 étapes. Usinage CNC mis en
          avant car c'est l'étape pivot de l'application. */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">{t("setup.stageRecapTitle")}</h3>
          <span className="text-xs text-slate-400">{t("setup.stageRecapHint")}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STAGE_ORDER.map((s) => {
            const meta = STAGE_META[s];
            const data = stageBreakdown[s];
            const isPivot = s === "usinage_cnc";
            return (
              <div
                key={s}
                className={`relative overflow-hidden rounded-xl border p-3 ${
                  isPivot ? "border-amber-300 ring-2 ring-amber-200" : "border-slate-100"
                }`}
              >
                <div className={`absolute -end-3 -top-3 h-14 w-14 rounded-full bg-gradient-to-br ${meta.cardFrom} ${meta.cardTo} opacity-10`} />
                <div className="relative flex items-center gap-1 text-[11px] font-bold text-slate-500">
                  {isPivot && <Star size={11} className="text-amber-500" />}
                  {t(meta.labelKey)}
                </div>
                {data.hasHours && (
                  <div className="relative mt-1 text-xs text-slate-400" dir="ltr">
                    {data.hours.toFixed(2)} {t("setup.stageHoursShort")}
                  </div>
                )}
                <div className="relative mt-1 text-lg font-extrabold text-slate-800" dir="ltr">
                  {data.cost.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs font-semibold text-slate-500">{t("setup.stageGrandTotal")}</span>
          <span className="text-base font-extrabold text-slate-800" dir="ltr">{stageGrandTotal.toFixed(2)}</span>
        </div>
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
          {lastCncSync > 0 && (
            <div className="mt-1 text-xs text-amber-600">{t("setup.cncSyncedHint", { count: lastCncSync })}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => void saveEstimate()} disabled={isSaving} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {isSaving ? t("setup.verifyingBtn") : t("setup.saveEstimate")}
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