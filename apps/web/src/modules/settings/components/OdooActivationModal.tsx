import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, PowerOff, ShieldAlert, X, Power } from "lucide-react";

interface OdooActivationModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
  /**
   * Mode du modal :
   *   - "activate"   : première activation (demande de taper ODOO)
   *   - "deactivate" : désactivation (confirmation simple)
   * Défaut : "activate"
   */
  mode?: "activate" | "deactivate";
}

export function OdooActivationModal({
  onClose,
  onConfirm,
  mode = "activate",
}: OdooActivationModalProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDeactivate = mode === "deactivate";
  const CONFIRMATION_WORD = isDeactivate ? "DÉSACTIVER" : "ODOO";

  const matches = confirmText.trim().toUpperCase() === CONFIRMATION_WORD;
  const canSubmit = matches && !isProcessing;

  async function handleConfirm() {
    if (!canSubmit) return;
    setIsProcessing(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("odoo.activationError"));
      setIsProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className={`flex items-start gap-3 border-b p-5 ${
            isDeactivate
              ? "border-orange-100 bg-gradient-to-br from-orange-50 to-red-50"
              : "border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50"
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              isDeactivate ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-600"
            }`}
          >
            {isDeactivate ? <Power size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-extrabold text-slate-800">
              {isDeactivate ? t("odoo.deactivateModal.title") : t("odoo.activateModal.title")}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {isDeactivate
                ? t("odoo.deactivateModal.subtitle")
                : t("odoo.activateModal.subtitle")}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/60 disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Avertissement principal */}
          {isDeactivate ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert size={16} className="text-orange-600" />
                <span className="text-sm font-bold text-orange-800">
                  {t("odoo.deactivateModal.warning")}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-orange-700">
                {t("odoo.deactivateModal.warningBody")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert size={16} className="text-purple-600" />
                <span className="text-sm font-bold text-purple-800">
                  {t("odoo.activateModal.sourceWarning")}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-purple-700">
                {t("odoo.activateModal.sourceWarningBody")}
              </p>
            </div>
          )}

          {/* Ce qui va se passer */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {isDeactivate
                ? t("odoo.deactivateModal.whatWillHappen")
                : t("odoo.activateModal.whatWillHappen")}
            </p>
            <ul className="space-y-1.5 ps-1 text-xs text-slate-600">
              {isDeactivate ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span>{t("odoo.deactivateModal.bullet1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span>{t("odoo.deactivateModal.bullet2")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    <span>{t("odoo.deactivateModal.bullet3")}</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                    <span>{t("odoo.activateModal.bullet1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                    <span>{t("odoo.activateModal.bullet2")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                    <span>{t("odoo.activateModal.bullet3")}</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Confirmation par texte */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              {t("odoo.activateModal.confirmLabel", { word: CONFIRMATION_WORD })}
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isProcessing}
              placeholder={CONFIRMATION_WORD}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-mono tracking-widest focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-slate-50"
              dir="ltr"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ${
              isDeactivate
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {isDeactivate
                  ? t("odoo.deactivateModal.deactivating")
                  : t("odoo.activateModal.activating")}
              </>
            ) : (
              <>
                {isDeactivate ? <Power size={15} /> : <PowerOff size={15} />}
                {isDeactivate
                  ? t("odoo.deactivateModal.button")
                  : t("odoo.activateModal.activateButton")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}