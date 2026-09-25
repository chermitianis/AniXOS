import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { forceCloseShift, type OpenShiftRow } from "../api/shiftAdminApi";

interface Props {
  shift: OpenShiftRow;
  onClose: () => void;
  onClosed: () => void;
}

function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Fermeture administrative d'une shift bloquée (opérateur qui n'a jamais pu
 * appuyer sur Déconnexion — appareil perdu/réinitialisé). Contrairement à une
 * déconnexion normale, on ne peut jamais être certain de l'heure réelle de
 * fin : le formulaire l'affiche donc explicitement en clair, avec "maintenant"
 * comme valeur par défaut modifiable, et exige un motif — la shift est
 * marquée is_force_closed pour rester signalée dans les rapports. */
export function ForceCloseShiftModal({ shift, onClose, onClosed }: Props) {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [endedAt, setEndedAt] = useState(() => toLocalDatetimeInputValue(new Date().toISOString()));
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReasonMissing = reason.trim().length === 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isReasonMissing || !staffUser) return;
    setIsSaving(true);
    setError(null);
    try {
      const endedAtIso = new Date(endedAt).toISOString();
      const result = await forceCloseShift(shift.id, endedAtIso, reason.trim(), staffUser.id);
      if (!result.success) {
        setError(result.error ?? t("setup.forceCloseError"));
        return;
      }
      onClosed();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t("setup.forceCloseTitle")}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={19} />
          </button>
        </div>

        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{t("setup.forceCloseWarning")}</span>
        </div>

        <p className="mb-3 text-sm text-slate-600">
          <span className="font-bold">{shift.worker_name}</span>
          {" — "}
          {t("setup.forceCloseStartedAt", { date: new Date(shift.started_at).toLocaleString(i18n.language) })}
        </p>

        <label className="mb-3 block text-sm font-semibold text-slate-600">
          {t("setup.forceCloseEndedAt")}
          <input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            max={toLocalDatetimeInputValue(new Date().toISOString())}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            dir="ltr"
            required
          />
        </label>

        <label className="mb-4 block text-sm font-semibold text-slate-600">
          {t("setup.forceCloseReason")}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t("setup.forceCloseReasonPlaceholder")}
          />
          {isReasonMissing && (
            <span className="mt-1 block text-xs font-semibold text-red-500">{t("setup.forceCloseReasonRequired")}</span>
          )}
        </label>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg py-2 text-sm text-slate-500">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={isSaving || isReasonMissing}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {t("setup.forceCloseConfirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
