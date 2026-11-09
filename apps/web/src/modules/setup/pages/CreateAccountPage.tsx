import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  UserPlus,
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  Database,
  Briefcase,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";

// أيقونة Google (SVG مضمّنة)
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

interface CreateAccountPageProps {
  onCreated: () => void;
  onSwitchToLogin: () => void;
}

export function CreateAccountPage({ onCreated, onSwitchToLogin }: CreateAccountPageProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    owner_full_name: "",
    company_name: "",
    industry: "",
    phone: "",
    address: "",
    owner_email: "",
    database_name: "",
    owner_password: "",
    confirm_password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.owner_full_name.trim()) return t("createAccount.errFullName");
    if (!form.company_name.trim()) return t("createAccount.errCompanyName");
    if (!form.owner_email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email)) {
      return t("createAccount.errEmail");
    }
    if (!form.database_name.trim() || form.database_name.trim().length < 2) {
      return t("createAccount.errDatabaseName");
    }
    if (form.owner_password.length < 8) return t("createAccount.errPasswordShort");
    if (form.owner_password !== form.confirm_password) {
      return t("createAccount.errPasswordMismatch");
    }
    return null;
  }

  // دالة تسجيل الدخول بجوجل
  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
          // ✅ إضافة الصلاحية المطلوبة للحصول على البريد الإلكتروني
          scopes: "https://www.googleapis.com/auth/userinfo.email",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
      // المتصفح سيتم توجيهه تلقائياً إلى Google هنا
    } catch (err) {
      console.error("[Google SignIn]", err);
      setError(t("createAccount.errGeneric"));
      setIsGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-account", {
        body: {
          owner_full_name: form.owner_full_name.trim(),
          company_name: form.company_name.trim(),
          industry: form.industry.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          owner_email: form.owner_email.trim().toLowerCase(),
          database_name: form.database_name.trim(),
          owner_password: form.owner_password,
        },
      });

      if (fnError || !data?.success) {
        let errorCode: string | undefined = data?.error;
        let errorMessage: string | undefined = data?.message;

        if (fnError && typeof fnError === "object" && "context" in fnError) {
          try {
            const ctx = (fnError as { context: Response }).context;
            if (ctx && typeof ctx.json === "function") {
              const body = await ctx.json();
              errorCode = body?.error ?? errorCode;
              errorMessage = body?.message ?? errorMessage;
            }
          } catch {
            /* ignore */
          }
        }

        const KNOWN_CODES: Record<string, string> = {
          email_taken: "createAccount.errEmailTaken",
          invalid_email: "createAccount.errEmail",
          weak_password: "createAccount.errPasswordShort",
          invalid_database_name: "createAccount.errDatabaseName",
          invalid_input: "createAccount.errGeneric",
          auth_creation_failed: "createAccount.errGeneric",
          provisioning_failed: "createAccount.errGeneric",
        };

        const i18nKey = errorCode ? KNOWN_CODES[errorCode] : undefined;
        setError(i18nKey ? t(i18nKey) : (errorMessage ?? t("createAccount.errGeneric")));
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.owner_email.trim().toLowerCase(),
        password: form.owner_password,
      });

      if (signInError) {
        setError(t("setup.autoLoginFailed"));
        onSwitchToLogin();
        return;
      }

      onCreated();
    } catch (err) {
      console.error("[CreateAccountPage]", err);
      setError(t("createAccount.errGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50";
  const iconClass = "pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-3 sm:p-4">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative w-full max-w-2xl">
        <div className="mb-4 flex justify-center">
          <LanguageSwitcher variant="full" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white p-5 shadow-2xl sm:p-8"
        >
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-300">
              <Building2 size={26} />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800 sm:text-xl">
              {t("createAccount.title")}
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{t("createAccount.subtitle")}</p>
          </div>

          {/* ✅ زر Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-3 font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
          >
            {isGoogleSubmitting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            ) : (
              <GoogleIcon />
            )}
            {t("createAccount.continueWithGoogle")}
          </button>

          {/* فاصل "أو" */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">{t("createAccount.orDivider")}</span>
            </div>
          </div>

          <div className="mb-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-600">
              {t("createAccount.sectionOwner")}
            </h3>

            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("createAccount.ownerFullName")} *
            </label>
            <div className="relative mb-3">
              <User className={iconClass} size={18} />
              <input
                value={form.owner_full_name}
                onChange={(e) => update("owner_full_name", e.target.value)}
                className={`${inputClass} pe-10`}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">
                  {t("createAccount.phone")}
                </label>
                <div className="relative">
                  <Phone className={iconClass} size={18} />
                  <input
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className={`${inputClass} pe-10`}
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">
                  {t("auth.email")} *
                </label>
                <div className="relative">
                  <Mail className={iconClass} size={18} />
                  <input
                    type="email"
                    value={form.owner_email}
                    onChange={(e) => update("owner_email", e.target.value)}
                    className={`${inputClass} pe-10`}
                    dir="ltr"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-600">
              {t("createAccount.sectionCompany")}
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">
                  {t("createAccount.companyName")} *
                </label>
                <div className="relative">
                  <Building2 className={iconClass} size={18} />
                  <input
                    value={form.company_name}
                    onChange={(e) => update("company_name", e.target.value)}
                    className={`${inputClass} pe-10`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">
                  {t("createAccount.industry")}
                </label>
                <div className="relative">
                  <Briefcase className={iconClass} size={18} />
                  <input
                    value={form.industry}
                    onChange={(e) => update("industry", e.target.value)}
                    placeholder={t("setup.industryPlaceholder")}
                    className={`${inputClass} pe-10`}
                  />
                </div>
              </div>
            </div>

            <label className="mb-1 mt-3 block text-sm font-semibold text-slate-600">
              {t("createAccount.address")}
            </label>
            <div className="relative">
              <MapPin className={iconClass} size={18} />
              <input
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                className={`${inputClass} pe-10`}
              />
            </div>
          </div>

          <div className="mb-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-600">
              {t("createAccount.sectionDatabase")}
            </h3>

            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("createAccount.databaseName")} *
            </label>
            <div className="relative mb-1">
              <Database className={iconClass} size={18} />
              <input
                value={form.database_name}
                onChange={(e) => update("database_name", e.target.value)}
                placeholder={t("createAccount.databaseNamePlaceholder")}
                className={`${inputClass} pe-10`}
                dir="ltr"
                required
              />
            </div>
            <p className="mb-3 text-xs text-slate-400">{t("createAccount.databaseNameHint")}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">
                  {t("auth.password")} *
                </label>
                <div className="relative">
                  <Lock className={iconClass} size={18} />
                  <input
                    type="password"
                    value={form.owner_password}
                    onChange={(e) => update("owner_password", e.target.value)}
                    className={`${inputClass} pe-10`}
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">
                  {t("createAccount.confirmPassword")} *
                </label>
                <div className="relative">
                  <Lock className={iconClass} size={18} />
                  <input
                    type="password"
                    value={form.confirm_password}
                    onChange={(e) => update("confirm_password", e.target.value)}
                    className={`${inputClass} pe-10`}
                    minLength={8}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 py-3 font-bold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <UserPlus size={18} />
            {isSubmitting ? t("setup.saving") : t("createAccount.submit")}
          </button>

          <button
            type="button"
            onClick={onSwitchToLogin}
            className="w-full text-center text-sm font-medium text-slate-500 hover:text-indigo-600"
          >
            {t("setup.alreadyHaveAccount")}
          </button>
        </form>
      </div>
    </div>
  );
}
