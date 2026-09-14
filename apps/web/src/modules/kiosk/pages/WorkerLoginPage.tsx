import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { User, Lock, LogIn } from "lucide-react";
import { useWorkerSession } from "../../../auth/WorkerSessionContext";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
import { AppLogo } from "../../../shared/components/AppLogo";

export function WorkerLoginPage() {
  const { t } = useTranslation();
  const { login, isLoggingIn } = useWorkerSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoggingIn) return; // يمنع الإرسال المزدوج (نقر مزدوج / Enter متكرر) قبل تعطيل الزر فعلياً
    setErrorMessage(null);
    const result = await login(username, password);
    if (!result.success) {
      setErrorMessage(
        result.messageKey ? t(result.messageKey, result.messageParams) : t("auth.loginFailed")
      );
      setPassword("");
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      {/* توهج خلفي زخرفي هادئ — يمنح عمقاً بصرياً دون تشتيت الانتباه عن النموذج */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <LanguageSwitcher variant="full" />
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <AppLogo size="lg" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800">{t("kioskLogin.title")}</h1>
            <p className="text-sm font-medium text-slate-400">{t("kioskLogin.subtitle")}</p>
          </div>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("kioskLogin.usernameLabel")}</label>
          <div className="relative mb-4">
            <User className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-10 ps-4 text-lg focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50"
              autoFocus
              required
            />
          </div>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("kioskLogin.passwordLabel")}</label>
          <div className="relative mb-5">
            <Lock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-10 ps-4 text-lg focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50"
              required
            />
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 py-3.5 text-lg font-bold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <LogIn size={20} />
            {isLoggingIn ? t("kioskLogin.loggingIn") : t("kioskLogin.loginButton")}
          </button>
        </form>
      </div>
    </div>
  );
}
