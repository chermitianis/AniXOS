import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Lock } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { hasPermission } from "../../../auth/permissions";

interface SettingsGateProps {
  children: ReactNode;
}

/**
 * إعادة تحقق (Step-Up Authentication) + فحص صلاحية حقيقي مزدوج:
 *   1) هل يملك دور هذا الموظف صلاحية "settings:edit" أصلاً؟ (أو هو المالك)
 *      — إن لم يملكها، لا تظهر خانة كلمة السر إطلاقاً، بل رسالة رفض واضحة.
 *      هذا كان مفقوداً سابقاً: أي موظف يعرف كلمة سره الخاصة كان يمكنه
 *      الدخول للإعدادات بغض النظر عن دوره الفعلي.
 *   2) بعد التأكد من الصلاحية: إعادة إدخال كلمة السر لإثبات الحضور الفعلي.
 */
export function SettingsGate({ children }: SettingsGateProps) {
  const { t } = useTranslation();
  const { staffUser, role } = useStaffAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const isAuthorized = staffUser?.is_owner || hasPermission(role, "settings", "edit");

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsVerifying(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: staffUser.email,
        password,
      });

      if (verifyError) {
        setError(t("setup.wrongPasswordShort"));
        return;
      }

      setIsUnlocked(true);
    } finally {
      setIsVerifying(false);
    }
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-xl border border-red-100 bg-red-50 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 text-red-500" size={32} />
          <h2 className="mb-1 text-lg font-bold text-red-700">{t("setup.accessDeniedTitle")}</h2>
          <p className="text-sm text-red-500">{t("setup.accessDeniedBody")}</p>
        </div>
      </div>
    );
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={handleVerify} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
            <Lock className="text-indigo-600" size={22} />
          </div>
        </div>
        <h2 className="mb-1 text-center text-lg font-bold text-slate-800">{t("setup.protectedArea")}</h2>
        <p className="mb-4 text-center text-sm text-slate-400">{t("setup.reenterPassword")}</p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.password")}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoFocus
          required
        />

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button type="submit" disabled={isVerifying} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
          {isVerifying ? t("setup.verifyingBtn") : t("common.confirm")}
        </button>
      </form>
    </div>
  );
}
