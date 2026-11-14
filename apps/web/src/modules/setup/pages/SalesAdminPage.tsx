import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, X as XIcon, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, Package, Trash2, ListChecks, Link2,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import { PiecesInput, type PieceDraft } from "../../../shared/components/PiecesInput";
import type { Quote, Client } from "../../../shared/types/database";

// ✅ نموذج المنتج الرئيسي
interface MainProduct {
  name: string;
  quantity: string;
  unit_price: string;
}

// ✅ نموذج القطعة التقنية (قبل الحفظ)
interface TechnicalPieceDraft {
  tempId: string;
  name: string;
  quantity: string;
}

// ✅ نموذج Devis (مع الحقول الجديدة)
interface QuoteWithRefs extends Quote {
  client_name?: string;
  total?: number;
  odoo_reference?: string | null;
  client_order_ref?: string | null;
}

const emptyMainProduct: MainProduct = { name: "", quantity: "", unit_price: "" };

export function SalesAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<QuoteWithRefs[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // ✅ حقول الـ Devis
  const [clientId, setClientId] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [showOptions, setShowOptions] = useState(false);

  // ✅ المنتج الرئيسي
  const [mainProduct, setMainProduct] = useState<MainProduct>(emptyMainProduct);

  // ✅ القطع التقنية
  const [technicalPieces, setTechnicalPieces] = useState<TechnicalPieceDraft[]>([]);
  const [showPiecesModal, setShowPiecesModal] = useState(false);
  const [pieceDrafts, setPieceDrafts] = useState<PieceDraft[]>([]);

  // ✅ حالة الحفظ
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ✅ Modal Accepter
  const [acceptingQuote, setAcceptingQuote] = useState<Quote | null>(null);
  const [acceptProjectName, setAcceptProjectName] = useState("");
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // ✅ حالة Odoo
  const [odooActive, setOdooActive] = useState(false);

  // -----------------------------------------------------------------------
  // تحميل البيانات
  // -----------------------------------------------------------------------
  async function loadClients() {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as Client[]) ?? []);
  }

  async function loadQuotes() {
    const { data } = await supabase
      .from("quotes")
      .select("*, clients(name), quote_items(quantity, unit_price, piece_type)")
      .order("created_at", { ascending: false });

    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      const quoteItems = (row.quote_items as { quantity: number; unit_price: number; piece_type?: string }[] | null) ?? [];
      // ✅ نحسب المجموع من main_product فقط
      const total = quoteItems
        .filter((it) => !it.piece_type || it.piece_type === "main_product")
        .reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
      return {
        ...(row as unknown as QuoteWithRefs),
        client_name: (row.clients as { name?: string } | null)?.name,
        total,
        odoo_reference: row.odoo_reference as string | null,
        client_order_ref: row.client_order_ref as string | null,
      };
    });

    setQuotes(rows);
  }

  async function loadOdooStatus() {
    if (!staffUser?.company_id) return;
    const { data } = await supabase
      .from("odoo_config")
      .select("is_active")
      .eq("company_id", staffUser.company_id)
      .maybeSingle();
    setOdooActive((data as { is_active: boolean } | null)?.is_active ?? false);
  }

  useEffect(() => {
    void loadClients();
    void loadQuotes();
    void loadOdooStatus();
  }, [staffUser?.company_id]);

  // -----------------------------------------------------------------------
  // إدارة القطع التقنية
  // -----------------------------------------------------------------------
  function addTechnicalPieces() {
    const newPieces: TechnicalPieceDraft[] = pieceDrafts.map((p) => ({
      tempId: crypto.randomUUID(),
      name: p.name,
      quantity: "1",
    }));
    setTechnicalPieces((prev) => [...prev, ...newPieces]);
    setPieceDrafts([]);
    setShowPiecesModal(false);
  }

  function removeTechnicalPiece(tempId: string) {
    setTechnicalPieces((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  function updateTechnicalPiece(tempId: string, field: keyof TechnicalPieceDraft, value: string) {
    setTechnicalPieces((prev) =>
      prev.map((p) => (p.tempId === tempId ? { ...p, [field]: value } : p))
    );
  }

  // -----------------------------------------------------------------------
  // قبول الـ Devis
  // -----------------------------------------------------------------------
  function openAcceptDialog(quote: Quote) {
    setAcceptingQuote(quote);
    setAcceptProjectName("");
    setAcceptError(null);
  }

  async function handleAcceptQuote(e: FormEvent) {
    e.preventDefault();
    if (!acceptingQuote) return;
    setAcceptError(null);
    setIsAccepting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("accept-quote", {
        body: {
          quote_id: acceptingQuote.id,
          project_name: acceptProjectName,
        },
      });

      if (fnError || !data?.success) {
        setAcceptError(data?.message ?? "Erreur");
        return;
      }

      // ✅ إذا كان Odoo متصلاً، دفع الـ Devis إليه
      if (odooActive) {
        await supabase.functions.invoke("push-devis-to-odoo", {
          body: { quote_id: acceptingQuote.id },
        });
      }

      setSuccessMessage(
        odooActive
          ? `✅ Devis accepté et synchronisé avec Odoo.`
          : `✅ Devis accepté. Projet créé.`
      );

      setAcceptingQuote(null);
      await loadQuotes();
      setTimeout(() => setSuccessMessage(null), 6000);
    } finally {
      setIsAccepting(false);
    }
  }

  // -----------------------------------------------------------------------
  // حفظ الـ Devis
  // -----------------------------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !clientId) return;

    if (!mainProduct.name.trim()) {
      setError("Le produit principal est obligatoire.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      // 1. إنشاء الـ Devis
      const { data: quote, error: insertError } = await supabase
        .from("quotes")
        .insert({
          company_id: staffUser.company_id,
          client_id: clientId,
          valid_until: validUntil || null,
          created_by: staffUser.id,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        } as never)
        .select()
        .single();

      if (insertError || !quote) {
        setError(insertError?.message ?? "Erreur lors de la création du devis.");
        return;
      }

      // 2. إنشاء المنتج الرئيسي
      const { data: mainItem, error: itemError } = await supabase
        .from("quote_items")
        .insert({
          quote_id: (quote as Quote).id,
          company_id: staffUser.company_id,
          description: mainProduct.name.trim(),
          quantity: Number(mainProduct.quantity) || 1,
          unit_price: Number(mainProduct.unit_price) || 0,
          sequence_order: 0,
          piece_type: "main_product",
        })
        .select("id")
        .single();

      if (itemError || !mainItem) {
        setError(itemError?.message ?? "Erreur lors de la création du produit principal.");
        return;
      }

      // 3. إنشاء القطع التقنية
      if (technicalPieces.length > 0) {
        const pieceRows = technicalPieces.map((tp, index) => ({
          quote_id: (quote as Quote).id,
          company_id: staffUser.company_id,
          description: tp.name.trim(),
          quantity: Number(tp.quantity) || 1,
          unit_price: 0,
          sequence_order: index + 1,
          piece_type: "technical_piece",
          parent_item_id: (mainItem as { id: string }).id,
        }));

        const { error: piecesError } = await supabase.from("quote_items").insert(pieceRows);
        if (piecesError) {
          console.warn("Failed to insert technical pieces:", piecesError);
        }
      }

      // Reset
      setClientId("");
      setMainProduct(emptyMainProduct);
      setTechnicalPieces([]);
      setValidUntil(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split("T")[0];
      });
      setReference("");
      setNotes("");
      setShowOptions(false);

      await loadQuotes();
      setSuccessMessage("✅ Devis créé avec succès.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      {/* Formulaire de création */}
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.createQuote")}
        </h2>

        {/* Client & Valid Until */}
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label={`${t("setup.client")} *`}>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={adminInputClass}
              required
            >
              <option value="">{t("setup.noClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label={t("setup.validUntil")}>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={adminInputClass}
            />
          </AdminField>
        </div>

        {/* Options supplémentaires */}
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="mb-3 mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          {showOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t("setup.moreOptions", { defaultValue: "Plus d'options" })}
        </button>
        {showOptions && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <AdminField label={t("setup.reference", { defaultValue: "Référence" })}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BC-2024-001" className={adminInputClass} dir="ltr" />
            </AdminField>
            <AdminField label={t("setup.notes", { defaultValue: "Notes" })}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={adminInputClass} />
            </AdminField>
          </div>
        )}

        {/* Produit Principal */}
        <div className="mb-4 rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
            <Package size={12} />
            {t("setup.mainProduct", { defaultValue: "Produit Principal" })}
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={mainProduct.name}
              onChange={(e) => setMainProduct({ ...mainProduct, name: e.target.value })}
              placeholder={t("setup.productName", { defaultValue: "Nom du produit" })}
              className="w-full flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              required
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={mainProduct.quantity}
                onChange={(e) => setMainProduct({ ...mainProduct, quantity: e.target.value })}
                placeholder={t("setup.qtyShort", { defaultValue: "Qté" })}
                className="w-16 shrink-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-center text-sm placeholder:text-slate-400"
                dir="ltr"
              />
              <input
                type="number"
                value={mainProduct.unit_price}
                onChange={(e) => setMainProduct({ ...mainProduct, unit_price: e.target.value })}
                placeholder={t("setup.priceShort", { defaultValue: "Prix" })}
                className="w-20 shrink-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-center text-sm placeholder:text-slate-400"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Pièces Techniques */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              <ListChecks size={12} />
              {t("setup.technicalPieces", { defaultValue: "Pièces Techniques" })} ({technicalPieces.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowPiecesModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
            >
              <Plus size={11} />
              {t("setup.addTechnicalPiece", { defaultValue: "Ajouter" })}
            </button>
          </div>

          {technicalPieces.length > 0 ? (
            <ul className="space-y-1.5">
              {technicalPieces.map((tp) => (
                <li key={tp.tempId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <Package size={12} className="shrink-0 text-indigo-500" />
                  <input
                    value={tp.name}
                    onChange={(e) => updateTechnicalPiece(tp.tempId, "name", e.target.value)}
                    className="flex-1 border-0 bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={tp.quantity}
                    onChange={(e) => updateTechnicalPiece(tp.tempId, "quantity", e.target.value)}
                    className="w-12 shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-[10px]"
                    placeholder={t("setup.qtyShort", { defaultValue: "Qté" })}
                    dir="ltr"
                  />
                  <button
                    onClick={() => removeTechnicalPiece(tp.tempId)}
                    className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 py-3 text-center text-xs text-slate-400">
              {t("setup.noTechnicalPieces", { defaultValue: "Aucune pièce technique ajoutée" })}
            </p>
          )}
        </div>

        {/* Total */}
        <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
          <span>{t("setup.totalLabel")}</span>
          <span dir="ltr">
            {(Number(mainProduct.quantity) * Number(mainProduct.unit_price)).toFixed(2)} TND
          </span>
        </div>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {successMessage && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            <CheckCircle2 size={14} />
            {successMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving || !clientId || !mainProduct.name}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.createQuote")}
        </button>
      </form>

      {/* ✅ Liste des devis */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.quotesList")} ({quotes.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => (
            <li key={q.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                  {q.quote_number} — {q.client_name}
                </span>
                <span className="shrink-0 font-bold text-slate-800" dir="ltr">
                  {(q.total ?? 0).toFixed(2)} TND
                </span>
              </div>
              
              {/* ✅ عرض odoo_reference (رقم Odoo) إذا كان موجوداً */}
              {q.odoo_reference && (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-indigo-600">
                  <Link2 size={10} />
                  <span className="font-semibold">Odoo:</span>
                  <span className="font-mono" dir="ltr">{q.odoo_reference}</span>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  q.status === "accepted" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                }`}>
                  {q.status === "accepted" ? "Accepté" : "Brouillon"}
                </span>
                {q.status !== "accepted" && (
                  <button
                    onClick={() => openAcceptDialog(q)}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-bold text-white"
                  >
                    {t("setup.acceptQuote")}
                  </button>
                )}
              </div>
            </li>
          ))}
          {quotes.length === 0 && (
            <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>
          )}
        </ul>
      </div>

      {/* ✅ Modal Pieces */}
      {showPiecesModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                {t("setup.addTechnicalPiece", { defaultValue: "Ajouter des pièces techniques" })}
              </h3>
              <button onClick={() => setShowPiecesModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <XIcon size={16} />
              </button>
            </div>
            <PiecesInput value={pieceDrafts} onChange={setPieceDrafts} compact />
            <button
              onClick={() => {
                if (pieceDrafts.length === 0) return;
                addTechnicalPieces();
              }}
              disabled={pieceDrafts.length === 0}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus size={13} />
              {t("setup.add", { defaultValue: "Ajouter" })} {pieceDrafts.length} {t("setup.pieces", { defaultValue: "pièce(s)" })}
            </button>
          </div>
        </div>
      )}

      {/* ✅ Modal Accepter */}
      {acceptingQuote && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAcceptQuote} className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg sm:p-5">
            <h3 className="mb-1 text-base font-bold text-slate-800 sm:text-lg">
              {t("setup.acceptQuoteTitle")} {acceptingQuote.quote_number}
            </h3>
            <p className="mb-4 text-xs text-slate-400 sm:text-sm">
              {t("setup.acceptQuoteBody")}
            </p>

            <AdminField label={t("setup.projectName")}>
              <input
                value={acceptProjectName}
                onChange={(e) => setAcceptProjectName(e.target.value)}
                className={adminInputClass}
                required
                autoFocus
              />
            </AdminField>

            {acceptError && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {acceptError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAcceptingQuote(null)}
                className="flex-1 rounded-lg py-2 text-sm text-slate-500"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isAccepting}
                className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {isAccepting ? t("setup.acceptingBtn") : t("setup.confirmAccept")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}