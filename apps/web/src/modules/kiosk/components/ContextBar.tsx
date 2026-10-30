import { User, FolderKanban, Cpu, Hash, Package, Clock, Plus, Send, ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Machine, Project, PieceTask } from "../../../shared/types/database";
import type { ActiveWorkerProfile } from "../../../auth/WorkerSessionContext";
import type { WpInterface } from "../hooks/useActiveTask";

interface ContextBarProps {
  worker: ActiveWorkerProfile;
  machine: Machine | null;
  project: Project | null;
  clientName: string | null; // ✅ NEW
  pieceTask: PieceTask | null;
  ofWorkPackageId: string | null;
  estimatedTotalMinutes: number | null;
  consumedSeconds: number;
  onOpenSelector: () => void;
  onCompletePiece: () => void;
  onPausePiece: () => void;
  onChangePhase: (delta: number) => void;
  onAddEmergencyPiece: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 min";
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function ContextBar({
  worker,
  machine,
  project,
  clientName, // ✅ NEW
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

  const remainingMinutes =
    estimatedTotalMinutes != null && estimatedTotalMinutes > 0
      ? Math.max(0, estimatedTotalMinutes - Math.floor(consumedSeconds / 60))
      : null;

  const isPieceActive = pieceTask != null;

  return (
    <div className="flex flex-wrap items-stretch gap-2 p-3">
      {/* Opérateur */}
      <div className="flex min-w-[130px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          <User size={9} />
          {t("kiosk.operator")}
        </span>
        <span className="truncate text-sm font-bold text-slate-800">{worker.full_name}</span>
      </div>

      {/* Machine */}
      <div className="flex min-w-[150px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          <Cpu size={9} />
          {t("kiosk.machine")}
        </span>
        {machine ? (
          <button
            type="button"
            onClick={onOpenSelector}
            className="flex items-center gap-1 truncate text-sm font-bold text-slate-800 hover:text-indigo-600"
          >
            {machine.name}
            <ArrowLeftRight size={10} className="text-slate-400" />
            <span className="text-[10px] font-normal text-slate-400">{t("kiosk.outils")}</span>
          </button>
        ) : (
          <span className="truncate text-sm font-bold text-slate-400">{t("kiosk.notDefined")}</span>
        )}
      </div>

      {/* Phase */}
      <div className="flex min-w-[90px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          <Hash size={9} />
          {t("kiosk.phase")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChangePhase(-1)}
            disabled={!isPieceActive}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[20px] text-center text-sm font-bold text-slate-800">
            {pieceTask?.phase ?? "—"}
          </span>
          <button
            type="button"
            onClick={() => onChangePhase(+1)}
            disabled={!isPieceActive}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Client - ✅ NOUVELLE CASE */}
      <div className="flex min-w-[150px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          <User size={9} />
          {t("kiosk.client")}
        </span>
        <span className="truncate text-sm font-bold text-slate-800">
          {clientName ?? "—"}
        </span>
      </div>

      {/* Projet */}
      <div className="flex min-w-[200px] flex-1 flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          <FolderKanban size={9} />
          {t("kiosk.projectName")}
        </span>
        {project ? (
          <button
            type="button"
            onClick={onOpenSelector}
            className="flex items-center gap-1 truncate text-sm font-bold text-slate-800 hover:text-indigo-600"
          >
            {project.name}
            <ArrowLeftRight size={10} className="text-slate-400" />
            <span className="text-[10px] font-normal text-slate-400">{t("kiosk.change")}</span>
          </button>
        ) : (
          <span className="truncate text-sm font-bold text-slate-400">{t("kiosk.noActiveProject")}</span>
        )}
      </div>

      {/* Code projet */}
      <div className="flex min-w-[110px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t("kiosk.projectCode")}</span>
        <span className="font-mono text-sm font-bold text-slate-800" dir="ltr">
          {project?.code ?? "—"}
        </span>
      </div>

      {/* Pièce */}
      <div className="flex min-w-[120px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          <Package size={9} />
          {t("kiosk.piece")}
        </span>
        <span className="truncate text-sm font-bold text-slate-800">{pieceTask?.name ?? "—"}</span>
      </div>

      {/* Quantité */}
      <div className="flex min-w-[70px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t("kiosk.quantity")}</span>
        <span className="text-sm font-bold text-slate-800">{pieceTask?.quantity ?? "—"}</span>
      </div>

      {/* Estimation */}
      <div className="flex min-w-[90px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t("kiosk.estimation")}</span>
        <span className="text-sm font-bold text-slate-800">
          {estimatedTotalMinutes != null && estimatedTotalMinutes > 0
            ? formatDuration(estimatedTotalMinutes * 60)
            : "—"}
        </span>
      </div>

      {/* Temps restant */}
      <div className="flex min-w-[120px] flex-col justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
          <Clock size={9} />
          {t("kiosk.remainingTime")}
        </span>
        <span className="text-sm font-black text-emerald-700">
          {remainingMinutes != null ? formatDuration(remainingMinutes * 60) : "—"}
        </span>
      </div>
    </div>
  );
}
