import { useState } from "react";
import { NomenclatureListPage } from "./NomenclatureListPage";
import { NomenclatureEditorPage } from "./NomenclatureEditorPage";
import type { Nomenclature } from "../../../shared/types/database";

export function NomenclaturePage() {
  const [openItem, setOpenItem] = useState<Nomenclature | null>(null);

  return openItem ? (
    <NomenclatureEditorPage nomenclature={openItem} onBack={() => setOpenItem(null)} />
  ) : (
    <NomenclatureListPage onOpen={setOpenItem} />
  );
}
