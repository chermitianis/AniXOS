import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NomenclatureListPage } from "./NomenclatureListPage";
import { CostingEditorPage } from "../components/CostingEditorPage";
import { CostingArchivePage } from "./CostingArchivePage";
import { useNav } from "../../../app/NavContext";
import type { Nomenclature } from "../../../shared/types/database";

type EtudeTab = "en_cours" | "historiques";

export interface EditorTarget {
  nomenclature: Nomenclature;
  pieceTaskId: string;
  /** "study" (première étude) ou "resume" (reprendre un brouillon). */
  mode: "study" | "resume";
}

export function NomenclaturePage() {
  const { t } = useTranslation();
  const nav = useNav();
  const [activeTab, setActiveTab] = useState<EtudeTab>("en_cours");
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const params = nav.consumeParams();
    if (params?.projectId) {
      setPendingProjectId(params.projectId);
      setActiveTab("en_cours");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (editorTarget) {
    return (
      <CostingEditorPage
        nomenclature={editorTarget.nomenclature}
        initialPieceTaskId={editorTarget.pieceTaskId}
        mode={editorTarget.mode}
        onBack={() => {
          setEditorTarget(null);
          // Force le rechargement des listes pour refléter les changements
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  const tabs: { key: EtudeTab; label: string }[] = [
    { key: "en_cours", label: t("etude.tabs.nomenclature") },
    { key: "historiques", label: t("etude.tabs.archive") },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "en_cours" && (
        <NomenclatureListPage
          key={`nomenclature-${reloadKey}`}
          onOpenPiece={(nomenclature, pieceTaskId) =>
            setEditorTarget({ nomenclature, pieceTaskId, mode: "study" })
          }
          pendingProjectId={pendingProjectId}
          onPendingProjectHandled={() => setPendingProjectId(null)}
        />
      )}
      {activeTab === "historiques" && (
        <CostingArchivePage
          key={`archive-${reloadKey}`}
          onOpenPiece={(nomenclature, pieceTaskId, mode = "resume") =>
            setEditorTarget({ nomenclature, pieceTaskId, mode })
          }
        />
      )}
    </div>
  );
}