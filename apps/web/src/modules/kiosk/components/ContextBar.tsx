import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PauseCircle, CheckCircle2, ArrowLeftRight, MessageSquareText, Layers, Plus,
} from "lucide-react";
import type { ActiveWorkerProfile } from "../../../auth/WorkerSessionContext";
import type { Machine, Project, PieceTask } from "../../../shared/types/database";
import { MachineToolsModal } from "./MachineToolsModal";
import { PassationPanel } from "./PassationPanel";
import { usePieceHandoffsUnread } from "../hooks/usePieceHandoffsUnread";

interface ContextBarProps {
  worker: ActiveWorkerProfile;
  machine: Machine | null;
  project: Project | null;
  pieceTask: PieceTask | null;
  /** ✅ la work package actuellement sélectionnée (CNC / Classique). */
  ofWorkPackageId?: string | null;
  /** Temps total estimé pour la pièce (depuis piece_costing_operations). */
  estimatedTotalMinutes?: number | null;
  /** ✅ NEW : temps consommé (secondes) depuis la 1ère ouverture de la pièce. */
  consumedSeconds?: number | null;
  onOpenSelector: () => void;
  onCompletePiece: () => void;
  onPausePiece: () => void;
  onChangePhase: (delta: number) => void;
  /** ✅ NEW : ouvre le modal d'addition d'une pièce d'urgence. */
  onAddEmergencyPiece: () => void;
}

function Field({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: { text: string; onClick: () => void };
}) {
  return (
    <div className="flex min-w-[130px] flex-col rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm transition-colors hover:border-slate-300">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-extrabold text-slate-800">
          {value || "—"}
        </span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeftRight size={12} />
            {action.text}
          </button>
        )}
      </div>
    </div>
  );
}

function DecisionButtons({
  onCompletePiece,
  onPausePiece,
}: {
  onCompletePiece: () => void;
  onPausePiece: () => void;
}) {
  const { t } = useTranslation();
  const [pendingAction, setPendingAction] = useState<"finish" | "pause" | null>(null);

  function confirm() {
    if (pendingAction === "finish") onCompletePiece();
    if (pendingAction === "pause") onPausePiece();
    setPendingAction(null);
  }

  return (
    <>
      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPendingAction("finish")}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md shadow-emerald-200 transition-transform active:scale-95 hover:bg-emerald-700"
        >
          <CheckCircle2 size={18} /> {t("kiosk.finishPiece")}
        </button>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="mb-2 text-lg font-black text-slate-900">
              {pendingAction === "finish"
                ? t("kiosk.finishConfirmTitle")
                : t("kiosk.pauseConfirmTitle")}
            </h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              {pendingAction === "finish"
                ? t("kiosk.finishConfirmBody")
                : t("kiosk.pauseConfirmBody")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white shadow-lg ${
                  pendingAction === "finish"
                    ? "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700"
                    : "bg-amber-500 shadow-amber-200 hover:bg-amber-600"
                }`}
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Formate un nombre de minutes en "Xh YYmin" — retourne "—" si 0/null. */
function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

export function ContextBar({
  worker,
  machine,
  project,
  pieceTask,
  ofWorkPackageId,
  estimatedTotalMinutes,
  consumedSeconds,
  onOpenSelector,
  onCompletePiece,
  onPausePiece,
  onChangePhase,
  onAddEmergencyPiece,
}: ContextBarProps) {
  const { t } = useTranslation();
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isPassationOpen, setIsPassationOpen] = useState(false);
  const { unreadCount, refresh: refreshUnread } = usePieceHandoffsUnread(pieceTask?.id ?? null, worker.id);

  const estimatedMin =
    estimatedTotalMinutes ??
    pieceTask?.estimated_minutes ??
    pieceTask?.estimated_time_minutes ??
    0;

  // ✅ Temps restant = estimation − temps consommé (en minutes)
  const consumedMin = consumedSeconds != null ? Math.round(consumedSeconds / 60) : 0;
  const remainingMin = estimatedMin > 0 ? estimatedMin - consumedMin : null;
  const isOverrun = remainingMin !== null && remainingMin <= 0;

  const wpActive = Boolean(ofWorkPackageId);

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 bg-slate-100/70 px-4 py-3">
      <Field label={t("kiosk.operator")} value={worker.full_name} />

      <Field
        label={t("kiosk.machine")}
        value={machine?.name ?? t("kiosk.noMachine")}
        action={
          machine
            ? { text: t("kiosk.openTools"), onClick: () => setIsToolsOpen(true) }
            : undefined
        }
      />

      <div className="flex min-w-[130px] flex-col rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {t("kiosk.phase")}
        </span>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onChangePhase(-1)}
            disabled={!pieceTask || Number(pieceTask.phase ?? "1") <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base font-black text-slate-700 shadow-inner transition hover:bg-slate-200 disabled:opacity-30"
          >
            −
          </button>
          <span className="text-sm font-black text-indigo-600">
            {pieceTask?.phase ?? "1"}
          </span>
          <button
            type="button"
            onClick={() => onChangePhase(1)}
            disabled={!pieceTask}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base font-black text-slate-700 shadow-inner transition hover:bg-slate-200 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      <Field
        label={t("kiosk.projectName")}
        value={project?.name ?? t("kiosk.noActiveProject")}
        action={{ text: t("kiosk.change"), onClick: onOpenSelector }}
      />
      <Field label={t("kiosk.projectCode")} value={project?.code ?? "—"} />

      <Field label={t("kiosk.piece")} value={pieceTask?.name ?? "—"} />

      <Field
        label={t("kiosk.quantity")}
        value={pieceTask?.quantity != null ? String(pieceTask.quantity) : "—"}
      />

      <Field
        label={t("kiosk.estimation")}
        value={formatMinutes(estimatedMin)}
      />

      {/* ✅ Temps restant (vert si > 0, rouge si dépassé) */}
      {remainingMin !== null && (
        <div
          className={`flex min-w-[130px] flex-col rounded-xl border px-3 py-2 shadow-sm transition-colors ${
            isOverrun
              ? "border-red-300 bg-red-50"
              : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isOverrun ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {t("kiosk.remainingTime")}
          </span>
          <span
            className={`mt-0.5 truncate text-sm font-extrabold ${
              isOverrun ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {isOverrun
              ? `+${formatMinutes(Math.abs(remainingMin))}`
              : formatMinutes(remainingMin)}
          </span>
        </div>
      )}

      {/* ✅ Indicateur de work package active */}
      {wpActive && (
        <div className="flex min-w-[110px] flex-col rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
            <Layers size={10} />
            {t("kiosk.workPackage")}
          </span>
          <span className="mt-0.5 text-xs font-bold text-indigo-700">
            {t("kiosk.workPackageActive")}
          </span>
        </div>
      )}

      {/* ✅ NEW : Bouton "+ Pièce d'urgence" */}
      <button
        type="button"
        onClick={onAddEmergencyPiece}
        className="flex items-center gap-1.5 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-700 transition hover:border-amber-500 hover:bg-amber-100 active:scale-95"
        title={t("kiosk.addEmergency.buttonHint")}
      >
        <Plus size={16} />
        {t("kiosk.addEmergency.button")}
      </button>

      {pieceTask && (
        <button
          type="button"
          onClick={() => setIsPassationOpen(true)}
          className="relative flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-amber-950 shadow-md shadow-amber-200/60 transition hover:bg-amber-300 active:scale-95"
        >
          {unreadCount > 0 && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-800 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-900"></span>
            </span>
          )}
          <MessageSquareText size={16} />
          {t("kiosk.passation")}
          {unreadCount > 0 && (
            <span className="rounded-full bg-amber-900 px-1.5 py-0.5 text-[10px] font-black text-white">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {pieceTask && (
        <DecisionButtons
          onCompletePiece={onCompletePiece}
          onPausePiece={onPausePiece}
        />
      )}

      {isToolsOpen && machine && (
        <MachineToolsModal
          machine={machine}
          onClose={() => setIsToolsOpen(false)}
        />
      )}

      {isPassationOpen && pieceTask && (
        <PassationPanel
          pieceTaskId={pieceTask.id}
          projectId={project?.id ?? null}
          shiftId={worker.shift_id}
          workerId={worker.id}
          onClose={() => {
            setIsPassationOpen(false);
            void refreshUnread();
          }}
        />
      )}
    </div>
  );
}