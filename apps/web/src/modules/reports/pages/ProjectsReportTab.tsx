import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Box, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { ProjectReportModal } from "../../setup/components/ProjectReportModal";
import type { Project } from "../../../shared/types/database";

const STATUS_LABEL_KEYS: Record<string, string> = {
  planned: "setup.draft", in_progress: "setup.statusInProgress", on_hold: "setup.pieceStatusPending",
  completed: "setup.statusCompleted", cancelled: "setup.cancelled",
};

/** نتيجة بحث عن قطعة — تُفتح عبرها تقرير المشروع المالك لها مباشرة */
interface PieceSearchResult {
  piece_task_id: string;
  piece_name: string;
  project_id: string;
  project_name: string;
  project_code: string | null;
}

export function ProjectsReportTab() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pieceResults, setPieceResults] = useState<PieceSearchResult[]>([]);
  const [isSearchingPieces, setIsSearchingPieces] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      setProjects((data as Project[]) ?? []);
    }
    void load();
  }, []);

  // بحث عن القطع (مع مهلة قصيرة لتفادي إرسال طلب عند كل ضغطة مفتاح)
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setPieceResults([]);
      return;
    }
    setIsSearchingPieces(true);
    const timeoutId = setTimeout(async () => {
      const { data } = await supabase
        .from("pieces_tasks")
        .select("id, name, project_id, projects(name, code)")
        .ilike("name", `%${query}%`)
        .limit(15);

      const rows = ((data ?? []) as Record<string, unknown>[])
        .filter((row) => row.project_id)
        .map((row) => ({
          piece_task_id: row.id as string,
          piece_name: row.name as string,
          project_id: row.project_id as string,
          project_name: (row.projects as { name?: string } | null)?.name ?? "—",
          project_code: (row.projects as { code?: string } | null)?.code ?? null,
        }));
      setPieceResults(rows);
      setIsSearchingPieces(false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // تصفية قائمة المشاريع محلياً بالاسم أو الكود — دون طلب شبكة إضافي
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(query) || (p.code ?? "").toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const hasActiveSearch = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* خانة البحث الموحدة عن مشروع أو قطعة */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("setup.searchProjectsPiecesPlaceholder")}
            className="w-full rounded-lg border border-slate-300 py-2.5 pe-10 ps-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {hasActiveSearch && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              aria-label={t("common.close")}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* نتائج بحث القطع: كل قطعة تفتح تقرير مشروعها الكامل مباشرة */}
        {hasActiveSearch && (isSearchingPieces || pieceResults.length > 0) && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t("setup.searchResultsPieces")}</p>
            {isSearchingPieces ? (
              <p className="text-sm text-slate-400">{t("setup.loadingSimple")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pieceResults.map((piece) => (
                  <li key={piece.piece_task_id}>
                    <button
                      onClick={() => setReportProjectId(piece.project_id)}
                      className="flex w-full items-center gap-2.5 rounded-lg bg-indigo-50/60 px-3 py-2 text-start text-sm transition hover:bg-indigo-100/70"
                    >
                      <Box size={15} className="shrink-0 text-indigo-500" />
                      <span className="font-semibold text-slate-700">{piece.piece_name}</span>
                      <span className="text-xs text-slate-400">
                        — {piece.project_name} {piece.project_code ? `(${piece.project_code})` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* قائمة المشاريع (مصفّاة عند وجود بحث) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm text-slate-400">{t("setup.fullProjectReport")}</p>
        <ul className="flex flex-col gap-2">
          {filteredProjects.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div>
                <span className="font-semibold text-slate-700">{p.name}</span>
                <span className="mr-2 text-xs text-slate-400">{p.code}</span>
                <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                  {t(STATUS_LABEL_KEYS[p.status] ?? p.status)}
                </span>
                {p.is_archived && <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{t("setup.archivedBadge")}</span>}
              </div>
              <button onClick={() => setReportProjectId(p.id)} className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white">
                {t("setup.viewReport")}
              </button>
            </li>
          ))}
          {filteredProjects.length === 0 && (
            <li className="text-sm text-slate-400">{hasActiveSearch ? t("setup.noSearchResults") : t("setup.noDataYet")}</li>
          )}
        </ul>
      </div>

      {reportProjectId && <ProjectReportModal projectId={reportProjectId} onClose={() => setReportProjectId(null)} />}
    </div>
  );
}
