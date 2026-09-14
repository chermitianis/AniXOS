import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStopReasons } from "../hooks/useStopReasons";
import { TaskCard } from "./TaskCard";
import type { ToggleResult } from "../hooks/useActiveTask";
import type { WorkSession, StopReason } from "../../../shared/types/database";

interface StopReasonsGridProps {
  /** حتى 3 أحداث نشطة بالتوازي للعامل — وليس حدثاً واحداً */
  activeSessions: WorkSession[];
  onToggle: (reason: StopReason, note?: string) => Promise<ToggleResult>;
  onMaxActiveEvents: () => void;
  onCorrectSession?: (session: WorkSession) => void;
}

/** العمود البرتقالي: أسباب التوقف، ديناميكي بالكامل من stop_reasons الخاصة
 * بالشركة. النقرة الأولى تبدأ، والثانية على نفس البطاقة توقف (toggle) —
 * حتى 3 بطاقات نشطة بالتوازي (مهام + توقفات معاً) كحد أقصى للعامل. */
export function StopReasonsGrid({ activeSessions, onToggle, onMaxActiveEvents, onCorrectSession }: StopReasonsGridProps) {
  const { t } = useTranslation();
  const { stopReasons, isLoading } = useStopReasons();
  const [pendingReason, setPendingReason] = useState<StopReason | null>(null);
  const [noteText, setNoteText] = useState("");

  async function handleCardClick(reason: StopReason) {
    const isCurrentlyActive = activeSessions.some((s) => s.stop_reason_id === reason.id);

    // الملاحظة الإجبارية مطلوبة فقط عند بدء التوقف، وليس عند إيقافه
    if (reason.requires_note && !isCurrentlyActive) {
      setPendingReason(reason);
      setNoteText("");
      return;
    }

    const result = await onToggle(reason);
    if (!result.ok && result.reason === "max_active") onMaxActiveEvents();
  }

  async function confirmNote() {
    if (pendingReason && noteText.trim()) {
      const result = await onToggle(pendingReason, noteText.trim());
      setPendingReason(null);
      if (!result.ok && result.reason === "max_active") onMaxActiveEvents();
    }
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.loadingStopReasons")}</div>;
  }

  if (stopReasons.length === 0) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.noStopReasons")}</div>;
  }

  return (
    <div className="relative flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="px-1 text-sm font-bold text-orange-700">{t("kiosk.stopReasons")}</h3>
      <div className="grid grid-cols-2 gap-3">
        {stopReasons.map((reason) => {
          const activeSession = activeSessions.find((s) => s.stop_reason_id === reason.id);
          return (
            <TaskCard
              key={reason.id}
              label={reason.name}
              color={reason.color}
              isActive={Boolean(activeSession)}
              onClick={() => void handleCardClick(reason)}
              onDoubleClick={activeSession && onCorrectSession ? () => onCorrectSession(activeSession) : undefined}
            />
          );
        })}
      </div>

      {pendingReason && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              {t("kiosk.noteRequired", { reason: pendingReason.name })}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="mb-3 h-24 w-full rounded-lg border border-slate-300 p-2 text-sm"
              placeholder={t("kiosk.notePlaceholder")}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingReason(null)}
                className="rounded-lg px-4 py-2 text-sm text-slate-500"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void confirmNote()}
                disabled={!noteText.trim()}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
