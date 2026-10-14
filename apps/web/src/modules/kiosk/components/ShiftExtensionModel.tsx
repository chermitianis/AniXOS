import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Play, LogOut } from "lucide-react";

interface ShiftExtensionModalProps {
  shiftId: string;
  hoursOpen: number;
  onExtended: () => void;
  onEndShift: () => Promise<void>;
  extendShift: (shiftId: string) => Promise<void>;
}

export function ShiftExtensionModal({
  shiftId,
  hoursOpen,
  onExtended,
  onEndShift,
  extendShift,
}: ShiftExtensionModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"extend" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roundedHours = Math.floor(hoursOpen);
  const roundedMinutes = Math.round((hoursOpen - roundedHours) * 60);

  async function handleExtend() {
    setBusy("extend");
    setError(null);
    try {
      await extendShift(shiftId);
      onExtended();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.saveError"));
    } finally {
      setBusy(null);
    }
  }

  async function handleEnd() {
    setBusy("end");
    setError(null);
    try {
      await onEndShift();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.saveError"));
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="text-amber-600" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-800">
              {t("kiosk.shiftOvertime.title", {
                defaultValue: "Fin de shift atteinte",
              })}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("kiosk.shiftOvertime.body", {
                defaultValue:
                  "Vous avez dépassé la durée standard du shift. Travaillez-vous toujours ou avez-vous oublié de vous déconnecter ?",
              })}
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>{t("kiosk.shiftOvertime.elapsed", { defaultValue: "Temps écoulé" })}</span>
            <span className="font-bold" dir="ltr">
              {roundedHours}h {String(roundedMinutes).padStart(2, "0")}min
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleExtend()}
            disabled={busy !== null}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy === "extend" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            {t("kiosk.shiftOvertime.continue", { defaultValue: "Je continue" })}
          </button>
          <button
            type="button"
            onClick={() => void handleEnd()}
            disabled={busy !== null}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
          >
            {busy === "end" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <LogOut size={16} />
            )}
            {t("kiosk.shiftOvertime.end", { defaultValue: "Terminer le shift" })}
          </button>
        </div>
      </div>
    </div>
  );
}