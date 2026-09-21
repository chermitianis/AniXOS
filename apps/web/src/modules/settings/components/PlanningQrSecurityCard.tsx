import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { AlertTriangle, QrCode as QrCodeIcon, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { resolveCompanyId } from "../../../lib/companyContext";
import { buildPlanningQrToken, generatePlanningQrSecret } from "../../../shared/utils/planningQrToken";

interface PlanningQrRow {
  company_id: string;
  qr_secret: string;
  generated_at: string;
  regenerate_count: number;
}

/** Onglet Sécurité → génération/régénération du QR unique de l'entreprise
 * pour la PWA Planning opérateur (/planning). Volontairement autonome et
 * simple : sera repositionné visuellement lors de la refonte complète du
 * module Settings (Mission 3), mais la logique ci-dessous restera la même. */
export function PlanningQrSecurityCard() {
  const { t, i18n } = useTranslation();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [row, setRow] = useState<PlanningQrRow | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const cid = await resolveCompanyId();
    setCompanyId(cid);

    if (!cid) {
      setIsLoading(false);
      return;
    }

    const { data } = await supabase.from("planning_qr_codes").select("*").eq("company_id", cid).maybeSingle();
    setRow((data as PlanningQrRow) ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!row || !companyId) {
      setQrImage(null);
      return;
    }
    const token = buildPlanningQrToken(companyId, row.qr_secret);
    let cancelled = false;
    QRCode.toDataURL(token, { width: 260, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrImage(url);
      })
      .catch(() => {
        if (!cancelled) setQrImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [row, companyId]);

  async function handleRegenerate() {
    if (!companyId) return;
    setIsRegenerating(true);
    setError(null);

    try {
      const newSecret = generatePlanningQrSecret();
      const { data, error: upsertError } = await supabase
        .from("planning_qr_codes")
        .upsert(
          {
            company_id: companyId,
            qr_secret: newSecret,
            generated_at: new Date().toISOString(),
            regenerate_count: (row?.regenerate_count ?? 0) + 1,
          } as never,
          { onConflict: "company_id" }
        )
        .select()
        .single();

      if (upsertError || !data) {
        setError(t("workerPlanningSettings.regenerateError"));
        return;
      }

      setRow(data as PlanningQrRow);
      setConfirmOpen(false);
    } finally {
      setIsRegenerating(false);
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-400">{t("setup.loadingSimple")}</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <QrCodeIcon size={18} className="text-indigo-600" />
          <h3 className="font-bold text-slate-800">{t("workerPlanningSettings.title")}</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">{t("workerPlanningSettings.description")}</p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex h-64 w-64 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
            {qrImage ? (
              <img src={qrImage} alt="QR planning" className="h-56 w-56" />
            ) : (
              <p className="px-4 text-center text-xs text-slate-400">{t("workerPlanningSettings.noQrYet")}</p>
            )}
          </div>

          <div className="flex-1 space-y-3 text-sm">
            {row && (
              <p className="text-slate-500">
                {t("workerPlanningSettings.generatedAt", {
                  date: new Date(row.generated_at).toLocaleString(i18n.language),
                })}
              </p>
            )}
            {row && row.regenerate_count > 0 && (
              <p className="text-xs text-slate-400">
                {t("workerPlanningSettings.regenerateCount", { count: row.regenerate_count })}
              </p>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{t("workerPlanningSettings.regenerateWarning")}</span>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {!confirmOpen ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <RefreshCw size={15} />
                {row ? t("workerPlanningSettings.regenerateButton") : t("workerPlanningSettings.generateButton")}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">{t("workerPlanningSettings.confirmPrompt")}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isRegenerating}
                    onClick={() => void handleRegenerate()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isRegenerating ? t("workerPlanningSettings.regenerating") : t("workerPlanningSettings.confirmRegenerate")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={14} />
          {t("workerPlanningSettings.ownerOnlyNote")}
        </div>
      </div>
    </div>
  );
}
