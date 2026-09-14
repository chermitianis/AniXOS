import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { ProjectReportModal } from "../components/ProjectReportModal";
import type { PieceTask, Project } from "../../../shared/types/database";

type ArchivedProject = Project & { client_name?: string; piece_names: string[] };

export function ArchivePage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ArchivedProject[]>([]);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [client, setClient] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [pieceName, setPieceName] = useState("");
  const [date, setDate] = useState("");

  async function loadArchivedProjects() {
    setIsLoading(true);
    const [{ data: projectRows }, { data: pieceRows }] = await Promise.all([
      supabase.from("projects").select("*, clients(name)").eq("is_archived", true).order("archived_at", { ascending: false }),
      supabase.from("pieces_tasks").select("id, project_id, name"),
    ]);
    const piecesByProject: Record<string, string[]> = {};
    for (const piece of (pieceRows as Pick<PieceTask, "project_id" | "name">[] | null) ?? []) {
      (piecesByProject[piece.project_id] ??= []).push(piece.name);
    }
    const rows = (projectRows ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as Project),
      client_name: (row.clients as { name?: string } | null)?.name,
      piece_names: piecesByProject[String(row.id)] ?? [],
    }));
    setProjects(rows); setIsLoading(false);
  }
  useEffect(() => { void loadArchivedProjects(); }, []);

  const filteredProjects = useMemo(() => {
    const q = (value: string) => value.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      const matches = (value: string, query: string) => !query || q(value).includes(q(query));
      return matches(project.client_name ?? "", client) && matches(project.code, projectCode) && matches(project.name, projectName) && matches(project.piece_names.join(" "), pieceName) && (!date || project.archived_at?.slice(0, 10) === date);
    });
  }, [projects, client, projectCode, projectName, pieceName, date]);

  function clearFilters() { setClient(""); setProjectCode(""); setProjectName(""); setPieceName(""); setDate(""); }
  if (isLoading) return <div className="p-4 text-sm text-slate-400">{t("setup.loadingArchive")}</div>;

  return <div className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Search size={18} className="text-indigo-600" /><h2 className="font-bold text-slate-800">{t("setup.archiveFilters")}</h2></div><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600"><X size={14} />{t("setup.clearFilters")}</button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><input value={client} onChange={(e) => setClient(e.target.value)} placeholder={t("setup.archiveClient")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder={t("setup.archiveCode")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={t("setup.archiveProject")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><input value={pieceName} onChange={(e) => setPieceName(e.target.value)} placeholder={t("setup.archivePiece")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><label className="relative"><CalendarDays size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm" /></label></div></div><p className="mb-4 text-sm text-slate-400">{t("setup.archiveDescription")} · {filteredProjects.length} / {projects.length}</p><ul className="flex flex-col gap-2">{filteredProjects.map((p) => <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm"><div><span className="font-semibold text-slate-700">{p.name}</span><span className="mr-2 text-slate-400">{p.code}</span>{p.client_name && <span className="mr-2 text-slate-400">— {p.client_name}</span>}<div className="mt-1 text-xs text-slate-400">{p.piece_names.join(" · ") || t("setup.noPiecesYet")}</div></div><div className="flex items-center gap-3"><span className="text-xs text-slate-400" dir="ltr">{p.archived_at && new Date(p.archived_at).toLocaleDateString("ar-SA")}</span><button onClick={() => setReportProjectId(p.id)} className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white">{t("setup.fullReportBtn")}</button></div></li>)}{filteredProjects.length === 0 && <li className="text-sm text-slate-400">{t("setup.noArchivedMatches")}</li>}</ul>{reportProjectId && <ProjectReportModal projectId={reportProjectId} onClose={() => setReportProjectId(null)} />}</div>;
}
