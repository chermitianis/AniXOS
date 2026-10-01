import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Search, X, FileText, RotateCcw } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import type { Project, Client, Nomenclature } from "../../../shared/types/database";

type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";

interface PieceInStudy {
  id: string;
  name: string;
  code: string | null;
  costing_status: CostingStatus;
}

interface ArchiveRow {
  id: string;
  study_name: string;
  project_id: string | null;
  project_name: string | null;
  project_code: string | null;
  pieces: PieceInStudy[];
  status: CostingStatus;
  total_estimated_cost: number | null;
  updated_at: string;
}

interface CostingArchivePageProps {
  onOpenPiece: (
    nomenclature: Nomenclature,
    pieceTaskId: string,
    mode?: "study" | "resume",
  ) => void;
}

const STATUS_BADGE: Record<CostingStatus, { labelKey: string; cls: string }> = {
  non_etudie: { labelKey: "setup.costingNotStudied", cls: "bg-slate-100 text-slate-600" },
  brouillon:  { labelKey: "setup.costingDraft",      cls: "bg-amber-100 text-amber-700" },
  en_attente: { labelKey: "setup.costingPending",    cls: "bg-blue-100 text-blue-700" },
  valide:     { labelKey: "setup.costingValidated",  cls: "bg-green-100 text-green-700" },
};

export function CostingArchivePage({ onOpenPiece }: CostingArchivePageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [pieceQuery, setPieceQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setLoadError(null);

    // RÈGLE DE SÉCURITÉ (C5) : company_id explicite sur les 4 requêtes.
    const [
      { data: nomData, error: nomErr },
      { data: projData },
      { data: clientData },
      { data: piecesData },
    ] = await Promise.all([
      supabase
        .from("nomenclatures")
        .select("id, name, project_id, status, total_estimated_cost, updated_at, projects!project_id(name, code)")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("projects")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("clients")
        .select("*")
        .eq("company_id", companyId)
        .order("name"),
      supabase
        .from("pieces_tasks")
        .select("id, name, code, project_id, costing_status, sequence_order")
        .eq("company_id", companyId)
        .order("sequence_order"),
    ]);

    if (nomErr) {
      console.error("[CostingArchive] Erreur nomenclatures:", nomErr);
      setLoadError(nomErr.message);
      setIsLoading(false);
      return;
    }

    // Regrouper les pièces par project_id
    const piecesByProject = new Map<string, PieceInStudy[]>();
    for (const p of (piecesData ?? []) as {
      id: string;
      name: string;
      code: string | null;
      project_id: string;
      costing_status: CostingStatus;
    }[]) {
      const arr = piecesByProject.get(p.project_id) ?? [];
      arr.push({
        id: p.id,
        name: p.name,
        code: p.code,
        costing_status: p.costing_status,
      });
      piecesByProject.set(p.project_id, arr);
    }

    const parsed: ArchiveRow[] = ((nomData ?? []) as Record<string, unknown>[]).map((n) => {
      const proj = n.projects as { name?: string; code?: string } | null;
      const id = n.id as string;
      const projectId = (n.project_id as string | null) ?? null;
      return {
        id,
        study_name: n.name as string,
        project_id: projectId,
        project_name: proj?.name ?? null,
        project_code: proj?.code ?? null,
        pieces: projectId ? piecesByProject.get(projectId) ?? [] : [],
        status: (n.status as CostingStatus) ?? "en_attente",
        total_estimated_cost: (n.total_estimated_cost as number | null) ?? null,
        updated_at: n.updated_at as string,
      };
    });

    setRows(parsed);
    setProjects((projData as Project[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    const channel = createSafeChannel(`costing-archive-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nomenclatures", filter: `company_id=eq.${companyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pieces_tasks", filter: `company_id=eq.${companyId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, load]);

  const filtered = useMemo(() => {
    const q = pieceQuery.trim().toLowerCase();
    const projectClientMap = new Map(projects.map((p) => [p.id, p.client_id]));
    return rows.filter((r) => {
      if (projectFilter && r.project_id !== projectFilter) return false;
      if (clientFilter && r.project_id && projectClientMap.get(r.project_id) !== clientFilter)
        return false;
      if (q) {
        const matchesStudy = r.study_name.toLowerCase().includes(q);
        const matchesPiece = r.pieces.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.code ?? "").toLowerCase().includes(q),
        );
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

  /** Ouvrir une pièce précise d'une nomenclature (avec son vrai id). */
  async function handleOpenPiece(row: ArchiveRow, piece: PieceInStudy, mode: "study" | "resume") {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("nomenclatures")
      .select("*")
      .eq("id", row.id)
      .eq("company_id", companyId)
      .single();
    if (error || !data) return;
    onOpenPiece(data as Nomenclature, piece.id, mode);
  }

  /** Reprendre la première pièce en brouillon du projet, sinon la première. */
  function handleResumeStudy(row: ArchiveRow) {
    const draftPiece = row.pieces.find((p) => p.costing_status === "brouillon");
    const target = draftPiece ?? row.pieces[0];
    if (!target) return;
    void handleOpenPiece(row, target, "resume");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {loadError && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Erreur de chargement : {loadError}
        </div>
      )}

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
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          {t("etude.archive.empty")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">{t("etude.archive.empty")}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const hasDraft = r.pieces.some((p) => p.costing_status === "brouillon");
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50/60">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {r.project_name ?? r.study_name}
                      </span>
                      {r.project_code && (
                        <span className="font-mono text-[11px] text-slate-400" dir="ltr">
                          {r.project_code}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status].cls}`}>
                        {t(STATUS_BADGE[r.status].labelKey)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400" dir="ltr">
                      {new Date(r.updated_at).toLocaleString("fr-FR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-end">
                      <div className="text-sm font-extrabold text-indigo-700" dir="ltr">
                        {r.total_estimated_cost !== null
                          ? r.total_estimated_cost.toFixed(2)
                          : "—"}
                        <span className="ms-1 text-[10px] font-semibold text-indigo-400">TND</span>
                      </div>
                    </div>

                    {hasDraft && (
                      <button
                        type="button"
                        onClick={() => handleResumeStudy(r)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                      >
                        <RotateCcw size={12} />
                        {t("setup.continueStudy")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Liste des pièces */}
                {r.pieces.length > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {r.pieces.map((p) => {
                      const badge = STATUS_BADGE[p.costing_status];
                      const isDraft = p.costing_status === "brouillon";
                      return (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs"
                        >
                          <span className="truncate font-semibold text-slate-700">{p.name}</span>
                          {p.code && (
                            <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                              {p.code}
                            </span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                            {t(badge.labelKey)}
                          </span>
                          <div className="ms-auto flex gap-1.5">
                            {isDraft && (
                              <button
                                type="button"
                                onClick={() => void handleOpenPiece(r, p, "resume")}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-600"
                              >
                                <RotateCcw size={11} />
                                {t("setup.continueStudy")}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleOpenPiece(r, p, "study")}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"
                            >
                              <FileText size={11} />
                              {t("setup.viewReport")}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {r.pieces.length === 0 && (
                  <div className="px-4 py-2 text-xs text-slate-400">
                    {t("setup.noPiecesYet")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}