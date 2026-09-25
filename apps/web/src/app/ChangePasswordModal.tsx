import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t("myProfile.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("myProfile.passwordMismatch"));
      return;
    }

    setIsSaving(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });
      if (authErr) {
        setError(authErr.message);
        return;
      }
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } finally {
      setIsSaving(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            {t("myProfile.changePasswordTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            <CheckCircle2 size={18} />
            {t("myProfile.passwordChanged")}
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                {t("myProfile.newPassword")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pe-10 text-sm"
                  required
                  autoFocus
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                {t("myProfile.confirmPassword")}
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
                minLength={8}
              />
            </div>

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving || !newPassword || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {t("myProfile.changePasswordButton")}
            </button>
          </>
        )}
      </form>
    </div>
  );

  return createPortal(modal, document.body);
}