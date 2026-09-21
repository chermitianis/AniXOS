import { useTranslation } from "react-i18next";
import { useState, type FormEvent } from "react";
import { Building2, UserPlus } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";

interface CreateCompanyPageProps {
  onCreated: () => void;
  onSwitchToLogin: () => void;
}

export function CreateCompanyPage({ onCreated, onSwitchToLogin }: CreateCompanyPageProps) {
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("tenant-provisioning", {
        body: {
          company_name: companyName,
          industry: industry || null,
          owner_full_name: ownerFullName,
          owner_email: ownerEmail,
          owner_password: ownerPassword,
        },
      });

      if (fnError || !data?.success) {
        setError(data?.message ?? "Erreur");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: ownerEmail,
        password: ownerPassword,
      });

      if (signInError) {
        setError(t("setup.autoLoginFailed"));
        onSwitchToLogin();
        return;
      }

      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-3 sm:p-4">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-4 flex justify-center">
          <LanguageSwitcher variant="full" />
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white p-5 shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-300">
              <Building2 size={26} />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800 sm:text-xl">
              {t("setup.createCompanyTitle")}
            </h1>
          </div>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.companyName")}</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={`mb-3 ${inputClass}`}
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.industry")}</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder={t("setup.industryPlaceholder")}
            className={`mb-3 ${inputClass}`}
          />

          <hr className="my-4 border-slate-200" />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.ownerFullName")}</label>
          <input
            value={ownerFullName}
            onChange={(e) => setOwnerFullName(e.target.value)}
            className={`mb-3 ${inputClass}`}
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.email")}</label>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className={`mb-3 ${inputClass}`}
            dir="ltr"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.password")}</label>
          <input
            type="password"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            minLength={8}
            className={`mb-4 ${inputClass}`}
            required
          />

          {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 py-3 font-bold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <UserPlus size={18} />
            {isSubmitting ? t("setup.saving") : t("setup.createCompanyButton")}
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