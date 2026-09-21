import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NomenclatureListPage } from "./NomenclatureListPage";
import { NomenclatureEditorPage } from "./NomenclatureEditorPage";
import { CostingPage } from "./CostingPage";
import { CostingArchivePage } from "./CostingArchivePage";
import type { Nomenclature } from "../../../shared/types/database";

type EtudeTab = "nomenclature" | "costing" | "archive";

export function NomenclaturePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<EtudeTab>("nomenclature");
  const [openItem, setOpenItem] = useState<Nomenclature | null>(null);

  const tabs: { key: EtudeTab; label: string }[] = [
    { key: "nomenclature", label: t("etude.tabs.nomenclature") },
    { key: "costing",      label: t("etude.tabs.costing") },
    { key: "archive",      label: t("etude.tabs.archive") },
  ];

  // Éditeur plein écran (comportement existant conservé, prioritaire sur les onglets)
  if (openItem) {
    return (
      <NomenclatureEditorPage
        nomenclature={openItem}
        onBack={() => setOpenItem(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "nomenclature" && (
        <NomenclatureListPage onOpen={setOpenItem} />
      )}
      {activeTab === "costing" && <CostingPage />}
      {activeTab === "archive" && <CostingArchivePage />}
    </div>
  );
}