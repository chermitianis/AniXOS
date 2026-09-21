// ============================================================================
// DeleteDatabaseModal — تأكيد حذف قاعدة بيانات (خطوة مزدوجة)
//
// الأمان:
//   - المستخدم يجب أن يكتب اسم القاعدة حرفيًا (case-insensitive)
//   - زر الحذف معطّل حتى يتطابق الاسم
//   - لا يمكن حذف القاعدة النشطة (يُتحقق في الواجهة والـ Edge Function)
//   - لا يمكن حذف آخر قاعدة (يُتحقق في الواجهة والـ Edge Function)
// ============================================================================

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface DeleteDatabaseModalProps {
  databaseId: string;
  databaseName: string;
  companyName: string;
  isCurrent: boolean;
  totalCount: number;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteDatabaseModal({
  databaseId,
  databaseName,
  companyName,
  isCurrent,
  totalCount,
  onClose,
  onDeleted,
}: DeleteDatabaseModalProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmText.trim().toLowerCase() === databaseName.trim().toLowerCase();
  const isBlocked = isCurrent || totalCount <= 1;
  const canSubmit = matches && !isDeleting && !isBlocked;

  async function handleDelete() {
    if (!canSubmit) return;
    setIsDeleting(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        setError(t("databasesManager.deleteModal.errSession"));
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        "delete-database",
        {
          body: { database_id: databaseId },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (fnError || !data?.success) {
        const code = data?.error;
        if (code === "cannot_delete_current") {
          setError(t("databasesManager.deleteModal.errCannotDeleteCurrent"));
        } else if (code === "cannot_delete_last") {
          setError(t("databasesManager.deleteModal.errCannotDeleteLast"));
        } else if (code === "forbidden") {
          setError(t("databasesManager.deleteModal.errForbidden"));
        } else {
          setError(data?.message || t("databasesManager.deleteModal.errGeneric"));
        }
        return;
      }

      onDeleted();
    } catch (err) {
      console.error("[DeleteDatabaseModal]", err);
      setError(t("databasesManager.deleteModal.errGeneric"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-100 bg-red-50 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-extrabold text-slate-800">
              {t("databasesManager.deleteModal.title")}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("databasesManager.deleteModal.subtitle")}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* ملخص القاعدة */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-bold text-slate-800">{companyName}</div>
            <div className="mt-0.5 font-mono text-xs text-slate-500" dir="ltr">
              {databaseName}
            </div>
          </div>

          {/* تحذيرات حجب */}
          {isCurrent && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              {t("databasesManager.deleteModal.warnCurrent")}
            </div>
          )}

          {totalCount <= 1 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              {t("databasesManager.deleteModal.warnLast")}
            </div>
          )}

          {/* تحذير عام */}
          {!isBlocked && (
            <>
              <div className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                ⚠️ {t("databasesManager.deleteModal.irreversible")}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">
                  {t("databasesManager.deleteModal.confirmLabel", {
                    name: databaseName,
                  })}
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={isDeleting}
                  placeholder={databaseName}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-slate-50"
                  dir="ltr"
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {error}
                </div>
              )}
            </>
          )}

          {isBlocked && error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isDeleting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {t("databasesManager.deleteModal.deleting")}
              </>
            ) : (
              <>
                <Trash2 size={15} />
                {t("databasesManager.deleteModal.submit")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}