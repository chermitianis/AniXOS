import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, X, ArrowRight } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  fetchForgottenShifts,
  type OpenShiftRow,
} from "../api/shiftAdminApi";
import { ForceCloseShiftModal } from "./ForceCloseShiftModal";

const REFRESH_DEBOUNCE_MS = 500;

/**
 * Bandeau "Sessions non clôturées" affiché en haut de Suivi OF.
 * Visible uniquement s'il existe au moins un shift ouvert :
 *   - dépassant 8h20 (durée standard + marge)
 *   - sans confirmation "je continue"
 * Disparaît automatiquement dès que :
 *   - l'opérateur ferme son shift, ou
 *   - l'opérateur confirme "je continue", ou
 *   - un responsable le ferme depuis ce bandeau.
 */
export function ForgottenShiftsBanner() {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [shifts, setShifts] = useState<OpenShiftRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [closingShift, setClosingShift] = useState<OpenShiftRow | null>(null);

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const rows = await fetchForgottenShifts();
    setShifts(rows);
  }, []);

  // Initial load + interval de secours (au cas où Realtime serait inactif)
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Realtime : réagit à toute modif de work_shifts (insert/update/delete)
  useEffect(() => {
    const companyId = staffUser?.company_id;
    if (!companyId) return;

    const channel = createSafeChannel(`forgotten-shifts-${companyId}`);
    const filter = `company_id=eq.${companyId}`;

    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => void load(), REFRESH_DEBOUNCE_MS);
    };

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_shifts", filter },
        scheduleReload,
      )
      .subscribe();

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, load]);

  if (shifts.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">
              {t("production.forgottenShifts.title", {
                defaultValue: "Sessions non clôturées",
              })}{" "}
              · {shifts.length}
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              {t("production.forgottenShifts.subtitle", {
                defaultValue:
                  "Opérateur(s) ayant dépassé 8h20 sans confirmer ni fermer leur shift.",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700"
          >
            {t("production.forgottenShifts.openBtn", {
              defaultValue: "Voir et fermer",
            })}
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {isOpen && (
        <ForgottenShiftsModal
          shifts={shifts}
          onClose={() => setIsOpen(false)}
          onRequestClose={(shift) => setClosingShift(shift)}
        />
      )}

      {closingShift && (
        <ForceCloseShiftModal
          shift={{
            id: closingShift.id,
            company_id: closingShift.company_id,
            worker_id: closingShift.worker_id,
            worker_name: closingShift.worker_name,
            started_at: closingShift.started_at,
            open_sessions_count: closingShift.open_sessions_count,
          }}
          onClose={() => setClosingShift(null)}
          onClosed={() => {
            setClosingShift(null);
            void load();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal : liste des shifts suspects
// ---------------------------------------------------------------------------
interface ForgottenShiftsModalProps {
  shifts: OpenShiftRow[];
  onClose: () => void;
  onRequestClose: (shift: OpenShiftRow) => void;
}

function ForgottenShiftsModal({
  shifts,
  onClose,
  onRequestClose,
}: ForgottenShiftsModalProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {t("production.forgottenShifts.modalTitle", {
                defaultValue: "Sessions à fermer",
              })}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("production.forgottenShifts.modalSubtitle", {
                defaultValue:
                  "Ces opérateurs ont dépassé la durée standard sans confirmation. Vérifiez avant de fermer.",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {shifts.map((s) => {
            const hours = Math.floor(s.hours_open);
            const minutes = Math.round((s.hours_open - hours) * 60);
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {s.worker_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500" dir="ltr">
                    {new Date(s.started_at).toLocaleString(i18n.language, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-amber-600" dir="ltr">
                    {hours}h {String(minutes).padStart(2, "0")}min ·{" "}
                    {s.open_sessions_count}{" "}
                    {t("production.forgottenShifts.sessionsOpen", {
                      defaultValue: "session(s) ouverte(s)",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRequestClose(s)}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
                >
                  {t("production.forgottenShifts.closeBtn", {
                    defaultValue: "Fermer",
                  })}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}