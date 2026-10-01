import { useMemo, useRef, useState } from "react";
import { Package, Plus, X, FolderOpen, Filter } from "lucide-react";

export interface PieceDraft {
  tempId: string;
  /** Nom canonique affiché — c'est lui qui sera stocké dans pieces_tasks.name */
  name: string;
  /** Extensions détectées lors du Parcourir (regroupées si même nom) */
  extensions: string[];
}

interface PiecesInputProps {
  value: PieceDraft[];
  onChange: (pieces: PieceDraft[]) => void;
  /** Noms déjà présents dans le projet ciblé (comparaison case-insensitive) */
  existingNames?: string[];
  /** Compact = hauteur limitée (utile dans une modale dense) */
  compact?: boolean;
}

type Filter = "all" | "new" | "existing";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function extractNameAndExt(filename: string): { name: string; ext: string } {
  const match = filename.match(/^(.+?)\.([^.]+)$/);
  if (match) return { name: match[1].trim(), ext: match[2].toLowerCase() };
  return { name: filename.trim(), ext: "" };
}

export function PiecesInput({
  value,
  onChange,
  existingNames = [],
  compact = false,
}: PiecesInputProps) {
  const [manualName, setManualName] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingSet = useMemo(
    () => new Set(existingNames.map(normalizeName)),
    [existingNames],
  );

  const isExisting = (piece: PieceDraft) =>
    existingSet.has(normalizeName(piece.name));

  function addManual() {
    const name = manualName.trim();
    if (!name) return;
    if (value.some((p) => normalizeName(p.name) === normalizeName(name))) {
      setManualName("");
      return;
    }
    onChange([...value, { tempId: crypto.randomUUID(), name, extensions: [] }]);
    setManualName("");
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    // Map : lowercase name -> PieceDraft (regroupe les extensions)
    const map = new Map<string, PieceDraft>();
    for (const p of value) {
      map.set(normalizeName(p.name), { ...p, extensions: [...p.extensions] });
    }
    for (const file of Array.from(files)) {
      const { name, ext } = extractNameAndExt(file.name);
      if (!name) continue;
      const key = normalizeName(name);
      const hit = map.get(key);
      if (hit) {
        if (ext && !hit.extensions.includes(ext)) {
          hit.extensions = [...hit.extensions, ext];
        }
      } else {
        map.set(key, {
          tempId: crypto.randomUUID(),
          name,
          extensions: ext ? [ext] : [],
        });
      }
    }
    onChange(Array.from(map.values()));
  }

  function removePiece(tempId: string) {
    onChange(value.filter((p) => p.tempId !== tempId));
  }

  function renamePiece(tempId: string, newName: string) {
    onChange(value.map((p) => (p.tempId === tempId ? { ...p, name: newName } : p)));
  }

  const filtered = value.filter((p) => {
    if (filter === "all") return true;
    if (filter === "existing") return isExisting(p);
    return !isExisting(p);
  });

  return (
    <div className="space-y-2">
      {/* Barre d'ajout */}
      <div className="flex gap-2">
        <input
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
          placeholder="Nom de la pièce…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="button"
          onClick={addManual}
          disabled={!manualName.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={13} />
          Ajouter
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <FolderOpen size={13} />
          Parcourir
        </button>
      </div>

      {/* Filtres */}
      {value.length > 0 && (
        <div className="flex items-center gap-1 text-[11px]">
          <Filter size={11} className="text-slate-400" />
          {(["all", "new", "existing"] as Filter[]).map((f) => {
            const labels: Record<Filter, string> = {
              all: "Tous",
              new: "Nouveaux",
              existing: "Existants",
            };
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  active
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
          <span className="ms-auto font-mono text-slate-400" dir="ltr">
            {value.length} {value.length === 1 ? "pièce" : "pièces"}
          </span>
        </div>
      )}

      {/* Liste */}
      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-400">
          Aucune pièce. Ajoutez manuellement ou via « Parcourir ».
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-xs text-slate-400">
          Aucun résultat pour ce filtre.
        </div>
      ) : (
        <ul
          className={`space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 ${
            compact ? "max-h-40" : "max-h-64"
          }`}
        >
          {filtered.map((p) => {
            const exists = isExisting(p);
            return (
              <li
                key={p.tempId}
                className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50"
              >
                <Package
                  size={12}
                  className={exists ? "shrink-0 text-red-400" : "shrink-0 text-slate-400"}
                />
                <input
                  value={p.name}
                  onChange={(e) => renamePiece(p.tempId, e.target.value)}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-700 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
                />
                {p.extensions.length > 0 && (
                  <span
                    className="shrink-0 font-mono text-[10px] text-slate-400"
                    dir="ltr"
                  >
                    {p.extensions.map((e) => `.${e}`).join(", ")}
                  </span>
                )}
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    exists
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                  title={exists ? "Existe déjà dans le projet" : "Nouvelle pièce"}
                >
                  {exists ? "Existe" : "Nouveau"}
                </span>
                <button
                  type="button"
                  onClick={() => removePiece(p.tempId)}
                  className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  <X size={11} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}