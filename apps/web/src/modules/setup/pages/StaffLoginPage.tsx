import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Lock, LogIn } from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";

interface StaffLoginPageProps {
  onSwitchToCreateCompany: () => void;
}

export function StaffLoginPage({ onSwitchToCreateCompany }: StaffLoginPageProps) {
  const { t } = useTranslation();
  const { signIn } = useStaffAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    const result = await signIn(email, password);
    setError(result.error ? t(result.error) : null);
    setIsSubmitting(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <LanguageSwitcher variant="full" />
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-2xl font-extrabold text-white shadow-lg shadow-indigo-300">
              AX
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800">{t("setup.staffLoginTitle")}</h1>
          </div>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.email")}</label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-10 ps-4 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50"
              dir="ltr"
              autoFocus
              required
            />
          </div>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.password")}</label>
          <div className="relative mb-5">
            <Lock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-10 ps-4 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50"
              required
            />
          </div>

          {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 py-3 text-base font-bold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <LogIn size={18} />
            {isSubmitting ? t("auth.loggingIn") : t("auth.login")}
          </button>

          <button type="button" onClick={onSwitchToCreateCompany} className="w-full text-center text-sm font-medium text-slate-500 hover:text-indigo-600">
            {t("setup.newCompany")}
          </button>
        </form>
      </div>
    </div>
  );
}
