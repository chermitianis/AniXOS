import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, ChevronRight, FolderOpen } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type { Project, PieceTask } from "../../../shared/types/database";

export interface PieceWithProject extends PieceTask {
  project_name: string;
  project_code: string;
  client_name: string | null;
}

interface PiecePickerProps {
  onSelect: (piece: PieceWithProject) => void;
  selectedId?: string | null;
  /** Filtre optionnel : "valide" = seulement les pièces validées côté chiffrage */
  filterCostingStatus?: "valide" | "any";
}

export function PiecePicker({
  onSelect,
  selectedId,
  filterCostingStatus = "valide",
}: PiecePickerProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [pieces, setPieces] = useState<PieceWithProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setIsLoading(true);
      const [{ data: projectsData }, { data: piecesData }, { data: clientsData }] =
        await Promise.all([
          supabase.from("projects").select("id, name, code, client_id").eq("is_archived", false),
          supabase
            .from("pieces_tasks")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase.from("clients").select("id, name"),
        ]);

      const projects = (projectsData ?? []) as Pick<Project, "id" | "name" | "code" | "client_id">[];
      const clients = (clientsData ?? []) as { id: string; name: string }[];
      const projMap = new Map(projects.map((p) => [p.id, p]));
      const clientMap = new Map(clients.map((c) => [c.id, c.name]));

      const rows = ((piecesData ?? []) as (PieceTask & { costing_status?: string })[])
        .filter((p) => {
          if (filterCostingStatus === "any") return true;
          return p.costing_status === "valide";
        })
        .map((p) => {
          const proj = p.project_id ? projMap.get(p.project_id) : null;
          return {
            ...p,
            project_name: proj?.name ?? "—",
            project_code: proj?.code ?? "—",
            client_name: proj?.client_id ? clientMap.get(proj.client_id) ?? null : null,
          };
        });

      if (mounted) {
        setPieces(rows);
        setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [staffUser?.company_id, filterCostingStatus]);

  const filtered = pieces.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.code ?? "").toLowerCase().includes(q) ||
      p.project_name.toLowerCase().includes(q)
    );
  });

  // Grouper par projet
  const byProject = new Map<string, PieceWithProject[]>();
  for (const p of filtered) {
    const key = p.project_id ?? "no-project";
    const arr = byProject.get(key) ?? [];
    arr.push(p);
    byProject.set(key, arr);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("common.search")}
        className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
      />

      {isLoading ? (
        <div className="p-4 text-center text-xs text-slate-400">{t("common.loading")}</div>
      ) : byProject.size === 0 ? (
        <div className="p-4 text-center text-xs text-slate-400">
          Aucune pièce disponible
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {Array.from(byProject.entries()).map(([projectId, projectPieces]) => {
            const first = projectPieces[0];
            return (
              <div key={projectId}>
                <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <FolderOpen size={11} />
                  <span className="truncate">{first.project_name}</span>
                  <span className="font-mono" dir="ltr">{first.project_code}</span>
                </div>
                <ul className="space-y-0.5">
                  {projectPieces.map((p) => {
                    const isActive = selectedId === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(p)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors ${
                            isActive
                              ? "bg-indigo-50 font-bold text-indigo-700"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <Package size={12} className="shrink-0 text-slate-400" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{p.name}</div>
                            <div className="truncate font-mono text-[10px] text-slate-400" dir="ltr">
                              {p.code ?? "—"}
                            </div>
                          </div>
                          <ChevronRight size={12} className="shrink-0 text-slate-300" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}