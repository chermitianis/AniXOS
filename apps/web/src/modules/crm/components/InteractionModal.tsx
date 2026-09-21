import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, Send } from "lucide-react";
import type { InteractionType } from "../api/crmApi";
import { useStaffAuth } from "../../../auth/StaffAuthContext";

interface InteractionModalProps {
  prospectId: string;
  onClose: () => void;
  onSave: (data: {
    type: InteractionType;
    summary: string;
    happened_at: string;
    author_staff_id: string | null;
  }) => Promise<void>;
}

const TYPES: InteractionType[] = ["appel", "email", "rdv", "note"];

export function InteractionModal({ prospectId, onClose, onSave }: InteractionModalProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [type, setType] = useState<InteractionType>("appel");
  const [summary, setSummary] = useState("");
  const [happenedAt, setHappenedAt] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        type,
        summary: summary.trim(),
        happened_at: new Date(happenedAt).toISOString(),
        author_staff_id: staffUser?.id ?? null,
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
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-extrabold text-slate-800">
            {t("crm.addInteraction")}
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
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {t("crm.interactionType")}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setType(tp)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                    type === tp
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t(`crm.interactionType${tp.charAt(0).toUpperCase() + tp.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {t("crm.interactionDate")}
            </label>
            <input
              type="datetime-local"
              value={happenedAt}
              onChange={(e) => setHappenedAt(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {t("crm.interactionSummary")} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              required
              placeholder={t("crm.interactionSummaryPlaceholder")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
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
              disabled={isSaving || summary.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                <>
                  <Send size={14} />
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