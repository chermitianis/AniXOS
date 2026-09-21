import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Database, Building2, Briefcase, X, Loader2 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface CreateDatabaseModalProps {
  onClose: () => void;
  onCreated: (companyId: string) => void;
  maxDatabases: number;
  currentCount: number;
}

export function CreateDatabaseModal({
  onClose,
  onCreated,
  maxDatabases,
  currentCount,
}: CreateDatabaseModalProps) {
  const { t } = useTranslation();
  const [databaseName, setDatabaseName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!databaseName.trim() || databaseName.trim().length < 2) {
      setError(t("createDatabase.errNameTooShort"));
      return;
    }
    if (!companyName.trim() || companyName.trim().length < 2) {
      setError(t("createDatabase.errCompanyTooShort"));
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-database", {
        body: {
          database_name: databaseName.trim(),
          company_name: companyName.trim(),
          industry: industry.trim() || null,
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

        const KNOWN: Record<string, string> = {
          database_limit_reached: "createDatabase.errLimitReached",
          database_name_taken: "createDatabase.errNameTaken",
          invalid_database_name: "createDatabase.errNameTooShort",
          invalid_company_name: "createDatabase.errCompanyTooShort",
          forbidden: "createDatabase.errForbidden",
        };

        const key = errorCode ? KNOWN[errorCode] : undefined;
        setError(key ? t(key) : (errorMessage ?? t("createDatabase.errGeneric")));
        return;
      }

      onCreated(data.database.id as string);
    } catch (err) {
      console.error("[CreateDatabaseModal]", err);
      setError(t("createDatabase.errGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50";
  const iconClass = "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400";

  const isAtLimit = currentCount >= maxDatabases;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute end-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={t("common.close")}
        >
          <X size={18} />
        </button>

        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-200">
            <Database size={22} />
          </div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-800">
            {t("createDatabase.title")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t("createDatabase.subtitle", {
              current: currentCount,
              max: maxDatabases,
            })}
          </p>
        </div>

        {isAtLimit ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {t("createDatabase.limitReached", { max: maxDatabases })}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("createDatabase.databaseName")} *
            </label>
            <div className="relative mb-3">
              <Database className={iconClass} size={18} />
              <input
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                placeholder={t("createDatabase.databaseNamePlaceholder")}
                className={`${inputClass} pe-10`}
                dir="ltr"
                required
                autoFocus
              />
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("createDatabase.companyName")} *
            </label>
            <div className="relative mb-3">
              <Building2 className={iconClass} size={18} />
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("createDatabase.companyNamePlaceholder")}
                className={`${inputClass} pe-10`}
                required
              />
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("createDatabase.industry")}
            </label>
            <div className="relative mb-4">
              <Briefcase className={iconClass} size={18} />
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder={t("createDatabase.industryPlaceholder")}
                className={`${inputClass} pe-10`}
              />
            </div>

            {error && (
              <div className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  t("createDatabase.submit")
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}