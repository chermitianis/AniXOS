import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import type { PlanningProjectOption } from "../hooks/useWorkerPlanning";
import type { PieceTask } from "../../../shared/types/database";

interface ProjectPieceSelectorModalProps {
  projectOptions: PlanningProjectOption[];
  loadPiecesForOption: (
    option: PlanningProjectOption
  ) => Promise<{ activePieces: PieceTask[]; completedPieces: PieceTask[] }>;
  onSelect: (option: PlanningProjectOption, piece: PieceTask | null) => void;
  onClose: () => void;
}

export function ProjectPieceSelectorModal({
  projectOptions,
  loadPiecesForOption,
  onSelect,
  onClose,
}: ProjectPieceSelectorModalProps) {
  const { t } = useTranslation();
  const [selectedOption, setSelectedOption] = useState<PlanningProjectOption | null>(null);
  const [activePieces, setActivePieces] = useState<PieceTask[]>([]);
  const [completedPieces, setCompletedPieces] = useState<PieceTask[]>([]);
  const [isLoadingPieces, setIsLoadingPieces] = useState(false);

  async function handleSelectProject(option: PlanningProjectOption) {
    setSelectedOption(option);
    setIsLoadingPieces(true);
    const { activePieces: active, completedPieces: completed } = await loadPiecesForOption(option);
    setActivePieces(active);
    setCompletedPieces(completed);
    setIsLoadingPieces(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {selectedOption ? t("kiosk.choosePieceTitle") : t("kiosk.chooseProjectTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400">
            ✕
          </button>
        </div>

        {!selectedOption ? (
          <>
            {projectOptions.length === 0 ? (
              <p className="text-sm text-slate-400">{t("kiosk.noAssignedProjects")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {projectOptions.map((option) => (
                  <li key={option.project.id}>
                    <button
                      onClick={() => void handleSelectProject(option)}
                      className="w-full rounded-lg border border-slate-200 p-3 text-right hover:bg-slate-50"
                    >
                      <div className="font-semibold text-slate-700">{option.project.name}</div>
                      <div className="text-xs text-slate-400">{option.project.code}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <button onClick={() => setSelectedOption(null)} className="mb-3 text-sm font-semibold text-blue-600">
              {t("kiosk.backToProjects")}
            </button>

            {isLoadingPieces ? (
              <p className="text-sm text-slate-400">{t("common.loading")}</p>
            ) : (
              <>
                {activePieces.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("kiosk.noPiecesForProject")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {activePieces.map((piece) => (
                      <li key={piece.id}>
                        <button
                          onClick={() => onSelect(selectedOption, piece)}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-right hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-semibold text-slate-700">{piece.name}</div>
                            {piece.phase && <div className="text-xs text-slate-400">{piece.phase}</div>}
                          </div>
                          {piece.estimated_time_minutes && (
                            <span className="text-xs text-slate-400" dir="ltr">
                              {t("kiosk.estimatedShort")}: {piece.estimated_time_minutes} {t("kiosk.minutesShort")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* قسم منفصل تماماً للقطع المكتملة — للعرض فقط، لا تُعاد إسنادها
                    بشكل عادي (البند 7 و11) */}
                {completedPieces.length > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-3">
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600">
                      <CheckCircle2 size={14} />
                      {t("kiosk.completedPiecesSection")}
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {completedPieces.map((piece) => (
                        <li
                          key={piece.id}
                          className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                        >
                          <span className="font-semibold">{piece.name}</span>
                          <CheckCircle2 size={14} className="shrink-0" />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
