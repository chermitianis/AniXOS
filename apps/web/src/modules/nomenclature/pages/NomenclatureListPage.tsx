import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Sparkles, FolderOpen } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import type { Nomenclature, Project, Client } from "../../../shared/types/database";

type NomenclatureExt = Nomenclature & { status: "en_attente" | "valide" };

interface NomenclatureListPageProps {
  onOpen: (nomenclature: Nomenclature) => void;
}

export function NomenclatureListPage({ onOpen }: NomenclatureListPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [studies, setStudies] = useState<(NomenclatureExt & { project_name?: string })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pendingPieceProjectIds, setPendingPieceProjectIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [isCreating, setIsCreating] = useState<string | null>(null); // project_id en cours de création

  const load = useCallback(async () => {
    const [{ data: studiesData }, { data: projectsData }, { data: clientsData }, { data: piecesData }, { data: rowsData }] = await Promise.all([
      supabase.from("nomenclatures").select("*, projects(name)").order("updated_at", { ascending: false }),
      supabase.from("projects").select("*").eq("is_archived", false).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("pieces_tasks").select("id, project_id").order("created_at", { ascending: false }).limit(500),
      supabase.from("nomenclature_rows").select("piece_task_id").not("piece_task_id", "is", null),
    ]);

    const rows = (studiesData ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as NomenclatureExt),
      project_name: (row.projects as { name?: string } | null)?.name,
    }));
    setStudies(rows);
    setProjects((projectsData as Project[]) ?? []);
    setClients((clientsData as Client[]) ?? []);

    // مشاريع بها قطع لم تُستورد بعد في أي دراسة — تظهر في قائمة المستجدات
    const importedIds = new Set(((rowsData ?? []) as { piece_task_id: string }[]).map((r) => r.piece_task_id));
    const pendingProjects = new Set<string>();
    for (const piece of (piecesData ?? []) as { id: string; project_id: string | null }[]) {
      if (piece.project_id && !importedIds.has(piece.id)) pendingProjects.add(piece.project_id);
    }
    setPendingPieceProjectIds(pendingProjects);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // بث حي: أي مشروع/قطعة جديدة أو دراسة جديدة تُحدّث القائمة الجانبية فوراً
  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`nomenclature-list-${staffUser.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pieces_tasks", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "nomenclatures", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, load]);

  const studiedProjectIds = useMemo(() => new Set(studies.map((s) => s.project_id).filter(Boolean)), [studies]);

  /** قائمة "المستجدات": مشاريع لم تُدرَس بعد، أو بها قطع جديدة لم تُستورد —
   * الأحدث أولاً */
  const newcomers = useMemo(
    () => projects.filter((p) => !studiedProjectIds.has(p.id) || pendingPieceProjectIds.has(p.id)),
    [projects, studiedProjectIds, pendingPieceProjectIds]
  );

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      const matchesClient = !clientFilter || p.client_id === clientFilter;
      return matchesQuery && matchesClient;
    });
  }, [projects, searchQuery, clientFilter]);

  /** يفتح دراسة موجودة للمشروع إن وُجدت، أو يُنشئ واحدة جديدة (الأعمدة
   * والأسطر تُستنسخ/تُستورد تلقائياً داخل المحرر نفسه) */
  async function openOrCreateStudyForProject(project: Project) {
    const existing = studies.find((s) => s.project_id === project.id);
    if (existing) {
      onOpen(existing);
      return;
    }
    if (!staffUser) return;
    setIsCreating(project.id);
    const { data } = await supabase
      .from("nomenclatures")
      .insert({ company_id: staffUser.company_id, project_id: project.id, name: project.name, created_by: staffUser.id })
      .select()
      .single();
    setIsCreating(null);
    if (data) onOpen(data as Nomenclature);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-5">
        {/* بحث + فلترة بالعميل عن المشروع المراد دراسته */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("setup.searchProjectToStudy")}
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-9 pe-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
              <option value="">{t("setup.allClients")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {filteredProjects.map((p) => {
              const study = studies.find((s) => s.project_id === p.id);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => void openOrCreateStudyForProject(p)}
                    disabled={isCreating === p.id}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-start text-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    <div>
                      <span className="font-semibold text-slate-700">{p.name}</span>
                      <span className="ms-2 text-xs text-slate-400" dir="ltr">{p.code}</span>
                    </div>
                    {study ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${study.status === "valide" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {study.status === "valide" ? t("setup.nomenclatureValide") : t("setup.nomenclatureEnAttente")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{t("setup.notStudiedYet")}</span>
                    )}
                  </button>
                </li>
              );
            })}
            {filteredProjects.length === 0 && <li className="py-3 text-center text-sm text-slate-400">{t("setup.noSearchResults")}</li>}
          </ul>
        </div>

        {/* سجل الدراسات — للرجوع مباشرة إلى دراسة سابقة دون البحث */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <FolderOpen size={15} /> {t("setup.studiesHistory")}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {studies.map((item) => (
              <li key={item.id}>
                <button onClick={() => onOpen(item)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
                  <div>
                    <span className="font-semibold text-slate-700">{item.name}</span>
                    {item.project_name && <span className="ms-2 text-xs text-slate-400">— {item.project_name}</span>}
                  </div>
                  <span className="font-bold text-slate-700" dir="ltr">
                    {item.total_estimated_cost !== null ? item.total_estimated_cost.toFixed(2) : "—"}
                  </span>
                </button>
              </li>
            ))}
            {studies.length === 0 && <li className="text-sm text-slate-400">{t("setup.noStudiesYet")}</li>}
          </ul>
        </div>
      </div>

      {/* القائمة الجانبية: المستجدات (مشاريع/قطع جديدة لم تُدرَس بعد) — الأحدث أعلى */}
      <aside className="h-fit rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-indigo-700">
          <Sparkles size={15} /> {t("setup.newcomers")}
        </h3>
        <ul className="flex flex-col gap-2">
          {newcomers.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => void openOrCreateStudyForProject(p)}
                disabled={isCreating === p.id}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-start transition-colors hover:bg-indigo-50 disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-slate-700">{p.name}</span>
                <span className="text-[11px] text-indigo-500">
                  {!studiedProjectIds.has(p.id) ? t("setup.newProjectBadge") : t("setup.newPiecesBadge")}
                </span>
              </button>
            </li>
          ))}
          {newcomers.length === 0 && <li className="text-xs text-slate-400">{t("setup.noNewcomers")}</li>}
        </ul>
      </aside>
    </div>
  );
}
