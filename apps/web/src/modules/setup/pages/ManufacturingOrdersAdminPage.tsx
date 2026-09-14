import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { ManufacturingOrder, ManufacturingOrderStatus, PieceTask } from "../../../shared/types/database";

const STATUS_LABEL_KEYS: Record<ManufacturingOrderStatus, string> = {
  draft: "setup.draft",
  confirmed: "setup.confirmed",
  in_progress: "setup.statusInProgress",
  done: "setup.statusCompleted",
  cancelled: "setup.cancelled",
};

const STATUS_COLORS: Record<ManufacturingOrderStatus, string> = {
  draft: "bg-slate-200 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

/** يعيد لون الحالة بشكل آمن حتى لو جاءت قيمة غير متوقعة من قاعدة البيانات */
function getStatusColor(status: string): string {
  return STATUS_COLORS[status as ManufacturingOrderStatus] ?? "bg-slate-100 text-slate-600";
}

/** يعيد مفتاح الترجمة للحالة بشكل آمن مع fallback */
function getStatusLabelKey(status: string): string {
  return STATUS_LABEL_KEYS[status as ManufacturingOrderStatus] ?? status;
}

/** الرقم التالي = آخر رقم أمر تصنيع رقمي تم إدخاله (يدوياً أو آلياً) + 1.
 * يتجاهل أي أرقام قديمة غير رقمية (مثل صيغة التاريخ السابقة) بدل أن تُعطّل الحساب */
function computeNextOrderNumber(list: { order_number: string }[]): string {
  const numeric = list.map((o) => parseInt(o.order_number, 10)).filter((n) => !isNaN(n));
  const max = numeric.length > 0 ? Math.max(...numeric) : 0;
  return String(max + 1);
}

export function ManufacturingOrdersAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();

  const [orders, setOrders] = useState<(ManufacturingOrder & { project_name?: string })[]>([]);
  const [approvedPieces, setApprovedPieces] = useState<(PieceTask & { project_name: string; project_code: string })[]>([]);

  // عناصر النموذج
  const [orderNumber, setOrderNumber] = useState("1");
  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [selectedPieceName, setSelectedPieceName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    const { data } = await supabase
      .from("manufacturing_orders")
      .select("*, projects(name)")
      .order("created_at", { ascending: false });

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as ManufacturingOrder),
      project_name: (row.projects as { name?: string } | null)?.name,
    }));
    setOrders(rows);
    setOrderNumber(computeNextOrderNumber(rows));
  }

  /** القطع "الجاهزة للتصنيع" فقط: تلك التابعة لمشاريع اعتمد قسم Nomenclature
   * دراسة تكلفتها (status = 'valide') — الأحدث أولاً */
  async function loadApprovedPieces() {
    const { data: validated } = await supabase.from("nomenclatures").select("project_id").eq("status", "valide").not("project_id", "is", null);
    const projectIds = Array.from(new Set(((validated ?? []) as { project_id: string }[]).map((n) => n.project_id)));
    if (projectIds.length === 0) {
      setApprovedPieces([]);
      return;
    }

    const { data: pieceData } = await supabase
      .from("pieces_tasks")
      .select("*, projects(name, code)")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(40);

    const rows = ((pieceData ?? []) as Record<string, unknown>[]).map((row) => ({
      ...(row as unknown as PieceTask),
      project_name: (row.projects as { name?: string } | null)?.name ?? "—",
      project_code: (row.projects as { code?: string } | null)?.code ?? "",
    }));
    setApprovedPieces(rows);
  }

  useEffect(() => {
    void loadOrders();
    void loadApprovedPieces();
  }, []);

  // اختيار قطعة من القائمة يحدد القطعة والمشروع معاً دفعة واحدة — لا لبس ممكن بعد الآن
  function handlePieceChange(pieceId: string) {
    setSelectedPieceId(pieceId);
    const piece = approvedPieces.find((p) => p.id === pieceId);
    if (!piece) {
      setSelectedPieceName("");
      setProjectId("");
      return;
    }
    setSelectedPieceName(piece.name);
    setProjectId(piece.project_id);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !projectId || !selectedPieceId) return;
    setError(null);
    setIsSaving(true);

    try {
      const { data: newOrder, error: insertError } = await supabase
        .from("manufacturing_orders")
        .insert({
          company_id: staffUser.company_id,
          project_id: projectId,
          order_number: orderNumber,
          product_name: selectedPieceName,
          quantity: Number(quantity) || 1,
          planned_start_date: plannedStart || null,
          planned_end_date: plannedEnd || null,
          created_by: staffUser.id,
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : "Erreur lors de la création");
        return;
      }

      // ربط القطعة بأمر التصنيع — يتيح لقسم Planification اشتقاق المشروع
      // والقطعة تلقائياً بمجرد اختيار رقم أمر التصنيع فقط
      if (newOrder) {
        await supabase.from("pieces_tasks").update({ manufacturing_order_id: newOrder.id }).eq("id", selectedPieceId);
      }

      // إعادة النموذج للوضع الافتراضي (رقم الأمر التالي يُحسب تلقائياً عبر loadOrders)
      setSelectedPieceId("");
      setSelectedPieceName("");
      setProjectId("");
      setQuantity(1);
      setPlannedStart("");
      setPlannedEnd("");
      await loadOrders();
      await loadApprovedPieces();
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(order: ManufacturingOrder, status: ManufacturingOrderStatus) {
    await supabase.from("manufacturing_orders").update({ status }).eq("id", order.id);
    await loadOrders();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-bold text-slate-800">{t("setup.createOrder")}</h2>
        <p className="mb-4 text-sm text-slate-400">{t("setup.manufacturingOrders")}</p>

        {/* 1. Numéro d'ordre */}
        <AdminField label={t("setup.orderNumber")}>
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            dir="ltr"
            className={adminInputClass}
            required
          />
        </AdminField>

        {/* 2. Référence / Nom de la pièce — uniquement les pièces validées en Nomenclature */}
        <AdminField label={t("setup.pieceReference")}>
          <select
            value={selectedPieceId}
            onChange={(e) => handlePieceChange(e.target.value)}
            className={adminInputClass}
            required
          >
            <option value="">{t("setup.choosePiece")}</option>
            {approvedPieces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.project_name} ({p.project_code})
              </option>
            ))}
          </select>
          {approvedPieces.length === 0 && <p className="mt-1 text-xs text-amber-600">{t("setup.noApprovedPiecesYet")}</p>}
        </AdminField>

        {/* 3. Nom du projet — détecté automatiquement, non modifiable */}
        <AdminField label={t("setup.projectName")}>
          <input
            type="text"
            readOnly
            value={approvedPieces.find((p) => p.id === selectedPieceId)?.project_name ?? ""}
            placeholder={t("setup.autoDetectedAfterPiece")}
            className={`${adminInputClass} cursor-not-allowed bg-slate-100 text-slate-500`}
            required
          />
        </AdminField>

        {/* 4. Quantité — compacte et professionnelle */}
        <AdminField label={t("setup.quantity")}>
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
              className="flex h-9 w-8 items-center justify-center bg-slate-100 font-bold text-slate-600 transition-colors hover:bg-slate-200"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              dir="ltr"
              className="h-9 w-14 border-x border-slate-300 text-center text-sm font-bold text-slate-800 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              required
            />
            <button
              type="button"
              onClick={() => setQuantity((prev) => prev + 1)}
              className="flex h-9 w-8 items-center justify-center bg-slate-100 font-bold text-slate-600 transition-colors hover:bg-slate-200"
            >
              +
            </button>
          </div>
        </AdminField>

        {/* 5. Début prévu / Fin prévue */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <AdminField label={t("setup.plannedStart")}>
            <input
              type="date"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
              className={adminInputClass}
            />
          </AdminField>
          <AdminField label={t("setup.plannedEnd")}>
            <input
              type="date"
              value={plannedEnd}
              onChange={(e) => setPlannedEnd(e.target.value)}
              className={adminInputClass}
            />
          </AdminField>
        </div>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving || !projectId || !selectedPieceId}
          className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.createOrder")}
        </button>
      </form>

      {/* قائمة أجهزة/أوامر التصنيع */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {t("setup.manufacturingOrders")} ({orders.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  {o.order_number} — {o.product_name}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(o.status)}`}>
                  {t(getStatusLabelKey(o.status))}
                </span>
              </div>
              <div className="mb-2 text-xs text-slate-400">
                {o.project_name} — {t("setup.quantityLabel")}: {o.quantity}
              </div>
              <select
                value={o.status}
                onChange={(e) => updateStatus(o, e.target.value as ManufacturingOrderStatus)}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {Object.entries(STATUS_LABEL_KEYS).map(([value, labelKey]) => (
                  <option key={value} value={value}>
                    {t(labelKey)}
                  </option>
                ))}
              </select>
            </li>
          ))}
          {orders.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>
    </div>
  );
}