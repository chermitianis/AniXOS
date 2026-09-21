import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import type { Project, Client } from "../../../shared/types/database";

interface ArchiveRow {
  id: string;
  study_name: string;
  project_id: string | null;
  project_name: string | null;
  project_code: string | null;
  piece_names: string[];
  status: "en_attente" | "valide";
  total_estimated_cost: number | null;
  updated_at: string;
}

export function CostingArchivePage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [pieceQuery, setPieceQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);

    const [
      { data: nomData },
      { data: projData },
      { data: clientData },
      { data: rowsData },
      { data: summaryData },
    ] = await Promise.all([
      supabase
        .from("nomenclatures")
        .select("id, name, project_id, status, total_estimated_cost, updated_at, projects(name, code)")
        .order("updated_at", { ascending: false }),
      supabase.from("projects").select("*").eq("is_archived", false).order("name"),
      supabase.from("clients").select("*").order("name"),
      supabase
        .from("piece_costing_operations")
        .select("nomenclature_id, piece_task_id, pieces_tasks(name)")
        .not("piece_task_id", "is", null),
      supabase
        .from("v_piece_costing_summary")
        .select("nomenclature_id, live_total"),
    ]);

    // Map nomenclature_id → live_total (calculé depuis v_piece_costing_summary)
    const liveTotalMap = new Map<string, number>();
    for (const s of (summaryData ?? []) as { nomenclature_id: string; live_total: number }[]) {
      liveTotalMap.set(s.nomenclature_id, Number(s.live_total ?? 0));
    }

    // Map nomenclature_id → liste des pièces (via piece_costing_operations)
    const piecesByStudy = new Map<string, Set<string>>();
    for (const r of (rowsData ?? []) as {
      nomenclature_id: string;
      piece_task_id: string | null;
      pieces_tasks: { name?: string } | null;
    }[]) {
      const name = r.pieces_tasks?.name;
      if (!name) continue;
      const set = piecesByStudy.get(r.nomenclature_id) ?? new Set<string>();
      set.add(name);
      piecesByStudy.set(r.nomenclature_id, set);
    }

    const parsed: ArchiveRow[] = ((nomData ?? []) as Record<string, unknown>[]).map((n) => {
      const proj = n.projects as { name?: string; code?: string } | null;
      const id = n.id as string;
      // Priorité au live_total (source de vérité) ; sinon total_estimated_cost sauvegardé
      const liveTotal = liveTotalMap.get(id);
      const savedTotal = (n.total_estimated_cost as number | null) ?? null;
      return {
        id,
        study_name: n.name as string,
        project_id: (n.project_id as string | null) ?? null,
        project_name: proj?.name ?? null,
        project_code: proj?.code ?? null,
        piece_names: Array.from(piecesByStudy.get(id) ?? []),
        status: n.status as "en_attente" | "valide",
        total_estimated_cost: liveTotal !== undefined ? liveTotal : savedTotal,
        updated_at: n.updated_at as string,
      };
    });

    setRows(parsed);
    setProjects((projData as Project[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`costing-archive-${staffUser.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nomenclatures", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "piece_costing_operations", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "piece_costing_materials", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, load]);

  const filtered = useMemo(() => {
    const q = pieceQuery.trim().toLowerCase();
    const projectClientMap = new Map(projects.map((p) => [p.id, p.client_id]));
    return rows.filter((r) => {
      if (projectFilter && r.project_id !== projectFilter) return false;
      if (clientFilter && r.project_id && projectClientMap.get(r.project_id) !== clientFilter) return false;
      if (q) {
        const matchesStudy = r.study_name.toLowerCase().includes(q);
        const matchesPiece = r.piece_names.some((n) => n.toLowerCase().includes(q));
        if (!matchesStudy && !matchesPiece) return false;
      }
      if (dateFilter && r.updated_at.slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [rows, projectFilter, clientFilter, pieceQuery, dateFilter, projects]);

  function clearFilters() {
    setProjectFilter("");
    setClientFilter("");
    setPieceQuery("");
    setDateFilter("");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {/* Filtres */}
      <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800 sm:text-base">
              {t("etude.archive.filtersTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600"
          >
            <X size={14} />
            <span className="hidden sm:inline">{t("setup.clearFilters")}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 sm:gap-3">
          <select
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value);
              setPieceQuery("");
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("etude.archive.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("setup.allClients")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            value={pieceQuery}
            onChange={(e) => setPieceQuery(e.target.value)}
            placeholder={t("etude.archive.searchPiecePlaceholder")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />

          <label className="relative">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute start-3 top-2.5 text-slate-400"
            />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 ps-9 text-sm"
            />
          </label>
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-400 sm:text-sm">
        {t("etude.archive.description")} · {filtered.length} / {rows.length}
      </p>

      {isLoading ? (
        <div className="p-6 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">{t("etude.archive.empty")}</div>
      ) : (
        <>
          {/* Vue mobile : cartes */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-700">
                      {r.project_name ?? r.study_name}
                    </div>
                    {r.project_code && (
                      <div className="truncate font-mono text-[11px] text-slate-400" dir="ltr">
                        {r.project_code}
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === "valide"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.status === "valide"
                      ? t("setup.nomenclatureValide")
                      : t("setup.nomenclatureEnAttente")}
                  </span>
                </div>

                {r.piece_names.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    <span className="text-[10px] uppercase text-slate-400">
                      {t("etude.archive.colPieces")}:
                    </span>{" "}
                    {r.piece_names.join(" · ")}
                  </div>
                )}

                <div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-2">
                  <div className="text-[10px] text-slate-400" dir="ltr">
                    {new Date(r.updated_at).toLocaleDateString("fr-FR")}
                  </div>
                  <div className="text-base font-extrabold text-indigo-700" dir="ltr">
                    {r.total_estimated_cost !== null
                      ? r.total_estimated_cost.toFixed(2)
                      : "—"}
                    <span className="ms-1 text-[10px] font-semibold text-indigo-400">TND</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Vue desktop : tableau */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 text-start">{t("etude.archive.colProject")}</th>
                  <th className="px-3 py-2.5 text-start">{t("etude.archive.colPieces")}</th>
                  <th className="px-3 py-2.5 text-start">{t("etude.archive.colStatus")}</th>
                  <th className="px-3 py-2.5 text-left" dir="ltr">{t("etude.archive.colCost")}</th>
                  <th className="px-3 py-2.5 text-left" dir="ltr">{t("etude.archive.colUpdated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-start">
                      <div className="font-semibold text-slate-700">
                        {r.project_name ?? r.study_name}
                      </div>
                      {r.project_code && (
                        <div className="text-xs text-slate-400" dir="ltr">
                          {r.project_code}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-start text-xs text-slate-500">
                      {r.piece_names.length > 0 ? r.piece_names.join(" · ") : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-start">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          r.status === "valide"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.status === "valide"
                          ? t("setup.nomenclatureValide")
                          : t("setup.nomenclatureEnAttente")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-left font-bold text-slate-700" dir="ltr">
                      {r.total_estimated_cost !== null ? r.total_estimated_cost.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left text-xs text-slate-400" dir="ltr">
                      {new Date(r.updated_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}