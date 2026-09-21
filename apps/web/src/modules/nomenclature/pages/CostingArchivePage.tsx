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
    const [{ data: nomData }, { data: projData }, { data: clientData }, { data: rowsData }] =
      await Promise.all([
        supabase
          .from("nomenclatures")
          .select("id, name, project_id, status, total_estimated_cost, updated_at, projects(name, code)")
          .order("updated_at", { ascending: false }),
        supabase.from("projects").select("*").eq("is_archived", false).order("name"),
        supabase.from("clients").select("*").order("name"),
        supabase
          .from("nomenclature_rows")
          .select("nomenclature_id, row_label, piece_task_id, pieces_tasks(name)")
          .not("piece_task_id", "is", null),
      ]);

    const piecesByStudy = new Map<string, string[]>();
    for (const r of (rowsData ?? []) as {
      nomenclature_id: string;
      row_label: string | null;
      pieces_tasks: { name?: string } | null;
    }[]) {
      const name = r.pieces_tasks?.name ?? r.row_label ?? "—";
      const arr = piecesByStudy.get(r.nomenclature_id) ?? [];
      arr.push(name);
      piecesByStudy.set(r.nomenclature_id, arr);
    }

    const parsed: ArchiveRow[] = ((nomData ?? []) as Record<string, unknown>[]).map((n) => {
      const proj = n.projects as { name?: string; code?: string } | null;
      return {
        id: n.id as string,
        study_name: n.name as string,
        project_id: (n.project_id as string | null) ?? null,
        project_name: proj?.name ?? null,
        project_code: proj?.code ?? null,
        piece_names: piecesByStudy.get(n.id as string) ?? [],
        status: n.status as "en_attente" | "valide",
        total_estimated_cost: (n.total_estimated_cost as number | null) ?? null,
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
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      {/* Bloc filtres */}
      <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-indigo-600" />
            <h2 className="font-bold text-slate-800">{t("etude.archive.filtersTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600"
          >
            <X size={14} />
            {t("setup.clearFilters")}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
              className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
            />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm"
            />
          </label>
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-400">
        {t("etude.archive.description")} · {filtered.length} / {rows.length}
      </p>

      {isLoading ? (
        <div className="p-6 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">{t("etude.archive.empty")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                    <div className="font-semibold text-slate-700">{r.project_name ?? r.study_name}</div>
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
      )}
    </div>
  );
}