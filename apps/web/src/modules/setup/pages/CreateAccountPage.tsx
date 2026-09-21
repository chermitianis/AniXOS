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
            disabled={isSubmitting}
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