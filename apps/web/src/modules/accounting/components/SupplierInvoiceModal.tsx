import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, Save, Calculator } from "lucide-react";
import {
  computeTTC,
  type SupplierInvoice,
  type SupplierInvoiceStatus,
} from "../api/accountingApi";
import { useStaffAuth } from "../../../auth/StaffAuthContext";

interface SupplierInvoiceModalProps {
  invoice?: SupplierInvoice | null;
  onClose: () => void;
  onSave: (data: Partial<SupplierInvoice>) => Promise<void>;
}

const STATUSES: SupplierInvoiceStatus[] = [
  "brouillon",
  "recue",
  "payee",
  "en_retard",
  "annulee",
];

export function SupplierInvoiceModal({ invoice, onClose, onSave }: SupplierInvoiceModalProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [amountHT, setAmountHT] = useState("");
  const [vatRate, setVatRate] = useState("19");
  const [status, setStatus] = useState<SupplierInvoiceStatus>("brouillon");
  const [category, setCategory] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!invoice;

  useEffect(() => {
    if (!invoice) return;
    setInvoiceNumber(invoice.invoice_number);
    setSupplierName(invoice.supplier_name);
    setSupplierEmail(invoice.supplier_email ?? "");
    setSupplierPhone(invoice.supplier_phone ?? "");
    setIssueDate(invoice.issue_date);
    setDueDate(invoice.due_date ?? "");
    setPaymentDate(invoice.payment_date ?? "");
    setAmountHT(invoice.amount_ht.toString());
    setVatRate(invoice.vat_rate.toString());
    setStatus(invoice.status);
    setCategory(invoice.category ?? "");
    setReference(invoice.reference ?? "");
    setNotes(invoice.notes ?? "");
  }, [invoice]);

  const amountTTC = useMemo(() => {
    const ht = parseFloat(amountHT) || 0;
    const rate = parseFloat(vatRate) || 0;
    return computeTTC(ht, rate);
  }, [amountHT, vatRate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        invoice_number: invoiceNumber.trim(),
        supplier_name: supplierName.trim(),
        supplier_email: supplierEmail.trim() || null,
        supplier_phone: supplierPhone.trim() || null,
        issue_date: issueDate,
        due_date: dueDate || null,
        payment_date: paymentDate || null,
        amount_ht: parseFloat(amountHT) || 0,
        vat_rate: parseFloat(vatRate) || 0,
        amount_ttc: amountTTC,
        status,
        category: category.trim() || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        created_by: invoice?.created_by ?? staffUser?.id ?? null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-extrabold text-slate-800">
            {isEdit ? t("accounting.editSupplierInvoice") : t("accounting.addSupplierInvoice")}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* N° facture */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                N° facture <span className="text-red-500">*</span>
              </label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Statut */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("accounting.supplierStatus")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplierInvoiceStatus)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`accounting.status_${s}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Fournisseur */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("accounting.supplierName")} <span className="text-red-500">*</span>
              </label>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Email fournisseur */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Email fournisseur
              </label>
              <input
                type="email"
                value={supplierEmail}
                onChange={(e) => setSupplierEmail(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Téléphone */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Téléphone
              </label>
              <input
                type="tel"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Dates */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Date d'émission <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Échéance
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Montants */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Montant HT <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={amountHT}
                onChange={(e) => setAmountHT(e.target.value)}
                required
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                TVA (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Montant TTC (calculé, lecture seule) */}
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Calculator size={12} />
                Montant TTC (calculé)
              </label>
              <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                <span className="text-lg font-extrabold text-indigo-700" dir="ltr">
                  {amountTTC.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </span>
                <span className="text-xs font-medium text-indigo-500">TND</span>
              </div>
            </div>

            {/* Catégorie */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Catégorie
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Matières premières, services…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Référence */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Référence
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          )}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                <>
                  <Save size={14} />
                  {t("common.save")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}