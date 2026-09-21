import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, Save } from "lucide-react";
import type { Prospect, ProspectStage } from "../api/crmApi";
import { useStaffAuth } from "../../../auth/StaffAuthContext";

interface ProspectModalProps {
  prospect?: Prospect | null;
  onClose: () => void;
  onSave: (data: Partial<Prospect>) => Promise<void>;
}

const STAGES: ProspectStage[] = ["nouveau", "contacte", "negociation", "gagne", "perdu"];

export function ProspectModal({ prospect, onClose, onSave }: ProspectModalProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<ProspectStage>("nouveau");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("");
  const [expectedCloseAt, setExpectedCloseAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!prospect;

  useEffect(() => {
    if (!prospect) return;
    setFullName(prospect.full_name);
    setCompanyName(prospect.company_name ?? "");
    setEmail(prospect.email ?? "");
    setPhone(prospect.phone ?? "");
    setSource(prospect.source ?? "");
    setNotes(prospect.notes ?? "");
    setStage(prospect.stage);
    setEstimatedValue(prospect.estimated_value?.toString() ?? "");
    setProbability(prospect.probability?.toString() ?? "");
    setExpectedCloseAt(prospect.expected_close_at ?? "");
  }, [prospect]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        full_name: fullName.trim(),
        company_name: companyName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        source: source.trim() || null,
        notes: notes.trim() || null,
        stage,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        probability: probability ? Number(probability) : null,
        expected_close_at: expectedCloseAt || null,
        owner_staff_id: prospect?.owner_staff_id ?? staffUser?.id ?? null,
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
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-extrabold text-slate-800">
            {isEdit ? t("crm.editProspect") : t("crm.addProspect")}
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
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.colName")} <span className="text-red-500">*</span>
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.colCompany")}
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.interactionType")} / Source
              </label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Site web, salon, recommandation…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.colEmail")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.colPhone")}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.colStage")}
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as ProspectStage)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`crm.stage${s.charAt(0).toUpperCase() + s.slice(1)}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.colValue")} (TND)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Probabilité (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Date de clôture prévue
              </label>
              <input
                type="date"
                value={expectedCloseAt}
                onChange={(e) => setExpectedCloseAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("crm.interactionSummary")} / Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
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