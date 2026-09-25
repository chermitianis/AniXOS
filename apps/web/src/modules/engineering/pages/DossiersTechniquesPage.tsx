import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText, Plus, Trash2, ExternalLink, X, Loader2, Paperclip,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { PiecePicker, type PieceWithProject } from "../components/PiecePicker";

type DocType = "plan" | "cad" | "cam" | "cnc_program" | "notice" | "other";

interface PieceDocument {
  id: string;
  piece_task_id: string;
  doc_type: DocType;
  title: string;
  url: string;
  notes: string | null;
  created_at: string;
}

const DOC_TYPES: { value: DocType; label: string; color: string }[] = [
  { value: "plan",        label: "Plan technique", color: "bg-blue-100 text-blue-700" },
  { value: "cad",         label: "Fichier CAD",    color: "bg-indigo-100 text-indigo-700" },
  { value: "cam",         label: "Fichier CAM",    color: "bg-purple-100 text-purple-700" },
  { value: "cnc_program", label: "Programme CNC",  color: "bg-amber-100 text-amber-700" },
  { value: "notice",      label: "Notice",         color: "bg-teal-100 text-teal-700" },
  { value: "other",       label: "Autre",          color: "bg-slate-100 text-slate-600" },
];

export function DossiersTechniquesPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [selectedPiece, setSelectedPiece] = useState<PieceWithProject | null>(null);
  const [docs, setDocs] = useState<PieceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [docType, setDocType] = useState<DocType>("plan");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async (pieceId: string) => {
    setIsLoading(true);
    const { data } = await supabase
      .from("piece_documents")
      .select("*")
      .eq("piece_task_id", pieceId)
      .order("created_at", { ascending: false });
    setDocs((data as PieceDocument[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPiece) void loadDocs(selectedPiece.id);
    else setDocs([]);
  }, [selectedPiece, loadDocs]);

  async function handleAdd() {
    if (!staffUser || !selectedPiece) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("piece_documents").insert({
        company_id: staffUser.company_id,
        piece_task_id: selectedPiece.id,
        doc_type: docType,
        title: title.trim(),
        url: url.trim(),
        notes: notes.trim() || null,
        created_by: staffUser.id,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setTitle("");
      setUrl("");
      setNotes("");
      setShowAdd(false);
      await loadDocs(selectedPiece.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await supabase.from("piece_documents").delete().eq("id", id);
    if (selectedPiece) await loadDocs(selectedPiece.id);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <PiecePicker
        selectedId={selectedPiece?.id}
        onSelect={setSelectedPiece}
      />

      <div className="space-y-4">
        {!selectedPiece ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            <Paperclip size={32} className="mx-auto mb-2 text-slate-300" />
            Sélectionnez une pièce à gauche
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-extrabold text-slate-800">
                    {selectedPiece.name}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono" dir="ltr">{selectedPiece.code ?? "—"}</span>
                    <span>· {selectedPiece.project_name}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <Plus size={13} />
                  Ajouter
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <Loader2 className="mx-auto animate-spin" size={18} />
              </div>
            ) : docs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                Aucun document. Cliquez sur "Ajouter".
              </div>
            ) : (
              <ul className="space-y-2">
                {docs.map((d) => {
                  const meta = DOC_TYPES.find((x) => x.value === d.doc_type) ?? DOC_TYPES[5];
                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                        <FileText size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-700">
                          {d.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.color}`}>
                            {meta.label}
                          </span>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-indigo-500 hover:underline"
                            dir="ltr"
                          >
                            {d.url}
                          </a>
                        </div>
                        {d.notes && (
                          <div className="mt-0.5 text-[11px] text-slate-400">{d.notes}</div>
                        )}
                      </div>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                        title="Ouvrir"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => void handleDelete(d.id)}
                        className="shrink-0 rounded p-1.5 text-red-500 hover:bg-red-50"
                        title={t("common.delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {showAdd && selectedPiece && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Nouveau document</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocType)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  Titre
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Ex: Plan de la bride"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  URL
                </label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="https://drive.google.com/..."
                  dir="ltr"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  Notes (optionnel)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
              <button
                disabled={saving || !title.trim() || !url.trim()}
                onClick={() => void handleAdd()}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Ajouter le document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}