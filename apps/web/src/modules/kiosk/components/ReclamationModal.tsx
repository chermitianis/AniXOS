import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Send, CheckCircle2 } from "lucide-react";
import { createReclamation, fetchActiveMachinesList } from "../api/kioskApi";
import type { Machine } from "../../../shared/types/database";

interface Props {
  workerId: string;
  onClose: () => void;
}

/** رسالة réclamation: إبلاغ الإدارة بمشكلة أو طلب متعلق بالورشة/الآلات/
 * الأدوات — تظهر لدى الإدارة في قسم "Maintenance et Besoins". */
export function ReclamationModal({ workerId, onClose }: Props) {
  const { t } = useTranslation();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    void fetchActiveMachinesList().then(setMachines);
  }, []);

  async function send() {
    if (!message.trim()) return;
    setIsSending(true);
    await createReclamation(workerId, machineId || null, message);
    setIsSending(false);
    setIsSent(true);
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t("kiosk.reclamationTitle")}</h2>
          <button type="button" onClick={onClose}>
            <X size={19} className="text-slate-400" />
          </button>
        </div>

        {isSent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="text-sm font-semibold text-slate-600">{t("kiosk.reclamationSent")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg bg-slate-100 px-5 py-2 text-sm font-bold text-slate-600"
            >
              {t("common.close")}
            </button>
          </div>
        ) : (
          <>
            <label className="mb-3 block text-sm font-semibold text-slate-600">
              {t("kiosk.reclamationMachineLabel")}
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t("kiosk.reclamationNoMachine")}</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-4 block text-sm font-semibold text-slate-600">
              {t("kiosk.reclamationMessageLabel")}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={t("kiosk.reclamationPlaceholder")}
                autoFocus
              />
            </label>

            <button
              type="button"
              onClick={() => void send()}
              disabled={isSending || !message.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              <Send size={15} />
              {isSending ? t("common.saving") : t("kiosk.reclamationSend")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
