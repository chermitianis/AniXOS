import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileSearch, Loader2, Search, X, Zap } from "lucide-react";
import type { PieceTask, Project } from "../../../shared/types/database";
import {
  createEmergencyPieceTask,
  fetchAllProjectsForWorker,
  searchPiecesInCompany,
} from "../api/kioskApi";

interface AddEmergencyPieceModalProps {
  workerId: string;
  shiftId: string | null;
  machineId: string | null;
  /** Callback après création — reçoit le planningId pour permettre la sélection immédiate */
  onCreated: (pieceTaskId: string, planningId: string) => void;
  onClose: () => void;
}

export function AddEmergencyPieceModal({
  workerId,
  shiftId,
  machineId,
  onCreated,
  onClose,
}: AddEmergencyPieceModalProps) {
  const { t } = useTranslation();

  // Projets
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // Recherche de pièces existantes
  const [pieceSearch, setPieceSearch] = useState("");
  const [pieceResults, setPieceResults] = useState<PieceTask[]>([]);
  const [isSearchingPieces, setIsSearchingPieces] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<PieceTask | null>(null);

  // Champs du formulaire
  const [pieceName, setPieceName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [technicalNotes, setTechnicalNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charge la liste des projets au montage
  useEffect(() => {
    let isMounted = true;
    void fetchAllProjectsForWorker().then((list) => {
      if (isMounted) {
        setProjects(list);
        setIsLoadingProjects(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Recherche de pièces avec debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = pieceSearch.trim();
    if (q.length < 2) {
      setPieceResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setIsSearchingPieces(true);
      const results = await searchPiecesInCompany(q);
      setPieceResults(results);
      setIsSearchingPieces(false);
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [pieceSearch]);

  // Synchronise le code projet quand un projet est sélectionné
  useEffect(() => {
    if (selectedProject && selectedProject.code) {
      setProjectCode(selectedProject.code);
    }
  }, [selectedProject]);

  // Auto-sélection du projet quand on choisit une pièce existante
  useEffect(() => {
    if (selectedPiece && !selectedProject) {
      const p = projects.find((pr) => pr.id === selectedPiece.project_id);
      if (p) setSelectedProject(p);
    }
    if (selectedPiece) {
      setPieceName(selectedPiece.name);
      setQuantity(selectedPiece.quantity ?? 1);
      if (selectedPiece.code) setProjectCode(selectedPiece.code);
    }
  }, [selectedPiece, selectedProject, projects]);

  const filteredProjects = projects.filter((p) => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.code ?? "").toLowerCase().includes(q)
    );
  });

  function handleQuickOpen() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
    setPieceName(nameWithoutExt);
    e.target.value = "";
  }

  async function handleSubmit() {
    setError(null);
    if (!selectedProject) {
      setError(t("kiosk.addEmergency.errors.noProject"));
      return;
    }
    if (!pieceName.trim()) {
      setError(t("kiosk.addEmergency.errors.noPieceName"));
      return;
    }
    if (!quantity || quantity < 1) {
      setError(t("kiosk.addEmergency.errors.invalidQuantity"));
      return;
    }

    setIsSaving(true);
    try {
      const result = await createEmergencyPieceTask({
        workerId,
        shiftId,
        machineId,
        projectId: selectedProject.id,
        pieceName: pieceName.trim(),
        pieceCode: projectCode.trim() || null,
        quantity,
        technicalNotes: technicalNotes.trim() || null,
        existingPieceTaskId: selectedPiece?.id ?? null,
      });
      onCreated(result.pieceTaskId, result.planningId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-amber-50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-amber-900">
            <Zap size={20} />
            {t("kiosk.addEmergency.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Recherche rapide d'une pièce existante */}
          <section className="mb-5">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("kiosk.addEmergency.searchPieceLabel")}
            </label>
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={pieceSearch}
                onChange={(e) => {
                  setPieceSearch(e.target.value);
                  setSelectedPiece(null);
                }}
                placeholder={t("kiosk.addEmergency.searchPiecePlaceholder")}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 ps-10 pe-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              {isSearchingPieces && (
                <Loader2
                  size={16}
                  className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500"
                />
              )}
            </div>

            {pieceResults.length > 0 && !selectedPiece && (
              <ul className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {pieceResults.map((p) => {
                  const projectName = projects.find((pr) => pr.id === p.project_id)?.name ?? "";
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPiece(p)}
                        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-start text-sm last:border-b-0 hover:bg-indigo-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-bold text-slate-800">{p.name}</div>
                          {projectName && (
                            <div className="truncate text-[11px] text-slate-400">
                              {projectName}
                            </div>
                          )}
                        </div>
                        {p.code && (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                            {p.code}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedPiece && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold text-emerald-800">
                    ✓ {selectedPiece.name}
                  </div>
                  <div className="truncate text-[11px] text-emerald-600">
                    {t("kiosk.addEmergency.pieceSelected")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPiece(null);
                    setPieceSearch("");
                  }}
                  className="shrink-0 rounded p-1 text-emerald-600 hover:bg-emerald-100"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </section>

          {/* Séparateur */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t("kiosk.addEmergency.orManual")}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Nom + Fichier */}
          <section className="mb-4">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("kiosk.addEmergency.pieceNameLabel")} *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pieceName}
                onChange={(e) => setPieceName(e.target.value)}
                placeholder={t("kiosk.addEmergency.pieceNamePlaceholder")}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="button"
                onClick={handleQuickOpen}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                title={t("kiosk.addEmergency.quickOpenHint")}
              >
                <FileSearch size={14} />
                {t("kiosk.addEmergency.quickOpen")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelected}
                className="hidden"
              />
            </div>
          </section>

          {/* Projet */}
          <section className="mb-4">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("kiosk.addEmergency.projectLabel")} *
            </label>
            {isLoadingProjects ? (
              <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                {t("common.loading")}
              </div>
            ) : selectedProject ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold text-indigo-800">
                    {selectedProject.name}
                  </div>
                  {selectedProject.code && (
                    <div className="truncate font-mono text-[11px] text-indigo-600">
                      {selectedProject.code}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProject(null)}
                  className="shrink-0 rounded p-1 text-indigo-600 hover:bg-indigo-100"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder={t("kiosk.addEmergency.projectSearchPlaceholder")}
                  className="mb-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {filteredProjects.length === 0 ? (
                    <li className="px-3 py-3 text-center text-xs text-slate-400">
                      {t("kiosk.addEmergency.noProjects")}
                    </li>
                  ) : (
                    filteredProjects.slice(0, 30).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedProject(p)}
                          className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-start text-sm last:border-b-0 hover:bg-indigo-50"
                        >
                          <span className="truncate font-semibold text-slate-700">
                            {p.name}
                          </span>
                          {p.code && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                              {p.code}
                            </span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </section>

          {/* Code projet + Quantité */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("kiosk.addEmergency.projectCodeLabel")}
              </label>
              <input
                type="text"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                placeholder="—"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("kiosk.addEmergency.quantityLabel")} *
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {/* Description de la tâche */}
          <section className="mb-2">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("kiosk.addEmergency.notesLabel")}
            </label>
            <textarea
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              rows={3}
              placeholder={t("kiosk.addEmergency.notesPlaceholder")}
              className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {t("kiosk.addEmergency.notesHint")}
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving || !selectedProject || !pieceName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-black text-white shadow-md shadow-amber-200 transition hover:bg-amber-600 disabled:opacity-50 disabled:shadow-none"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            <Zap size={14} />
            {isSaving ? t("common.saving") : t("kiosk.addEmergency.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}