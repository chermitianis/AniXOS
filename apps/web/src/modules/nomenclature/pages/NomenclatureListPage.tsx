import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, ChevronRight, ChevronDown, FolderOpen, Package,
  CheckCircle2, Clock, CircleDashed, Send, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import type { Nomenclature, Project, Client, PieceTask } from "../../../shared/types/database";

type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";
type ProductionStatus = "not_sent" | "sent";

interface PieceWithCosting extends PieceTask {
  costing_status: CostingStatus;
  production_status: ProductionStatus;
  study_total: number;
}

interface ProjectGroup {
  project: Project;
  client: Client | null;
  pieces: PieceWithCosting[];
  study: Nomenclature | null;
  totalCost: number;
}

interface NomenclatureListPageProps {
  onOpenPiece: (nomenclature: Nomenclature, pieceTaskId: string) => void;
  pendingProjectId?: string | null;
  onPendingProjectHandled?: () => void;
}

const STATUS_META: Record<CostingStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  non_etudie: { label: "Non étudié", color: "text-slate-500 bg-slate-100", Icon: CircleDashed },
  brouillon:  { label: "Brouillon",  color: "text-amber-700 bg-amber-100", Icon: Clock },
  en_attente: { label: "En attente", color: "text-blue-700 bg-blue-100",   Icon: Clock },
  valide:     { label: "Validé",     color: "text-green-700 bg-green-100", Icon: CheckCircle2 },
};

export function NomenclatureListPage({
  onOpenPiece,
  pendingProjectId,
  onPendingProjectHandled,
}: NomenclatureListPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<CostingStatus | "">("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);

    const [
      { data: projectsData },
      { data: clientsData },
      { data: piecesData },
      { data: nomenclaturesData },
      { data: opsData },
      { data: matsData },
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("is_archived", false).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("pieces_tasks").select("*").order("sequence_order"),
      supabase.from("nomenclatures").select("*"),
      supabase.from("piece_costing_operations").select("piece_task_id, subtotal"),
      supabase.from("piece_costing_materials").select("piece_task_id, subtotal"),
    ]);

    const pieceCost = new Map<string, number>();
    for (const r of (opsData ?? []) as { piece_task_id: string | null; subtotal: number }[]) {
      if (!r.piece_task_id) continue;
      pieceCost.set(r.piece_task_id, (pieceCost.get(r.piece_task_id) ?? 0) + Number(r.subtotal));
    }
    for (const r of (matsData ?? []) as { piece_task_id: string | null; subtotal: number }[]) {
      if (!r.piece_task_id) continue;
      pieceCost.set(r.piece_task_id, (pieceCost.get(r.piece_task_id) ?? 0) + Number(r.subtotal));
    }

    const projs = (projectsData as Project[]) ?? [];
    const cls = (clientsData as Client[]) ?? [];
    const pieces = (piecesData as PieceTask[]) ?? [];
    const noms = (nomenclaturesData as Nomenclature[]) ?? [];

    const grouped: ProjectGroup[] = projs.map((project) => {
      const study = noms.find((n) => n.project_id === project.id) ?? null;
      const projectPieces: PieceWithCosting[] = pieces
        .filter((p) => p.project_id === project.id)
        .map((p) => ({
          ...p,
          costing_status:
            ((p as unknown) as { costing_status?: CostingStatus }).costing_status ?? "non_etudie",
          production_status:
            ((p as unknown) as { production_status?: ProductionStatus }).production_status ?? "not_sent",
          study_total: pieceCost.get(p.id) ?? 0,
        }));
      const totalCost = projectPieces.reduce((s, p) => s + p.study_total, 0);
      return {
        project,
        client: cls.find((c) => c.id === project.client_id) ?? null,
        pieces: projectPieces,
        study,
        totalCost,
      };
    });

    setGroups(grouped);
    setClients(cls);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (groups.length === 0) return;
    const toExpand = new Set<string>();
    for (const g of groups) {
      if (g.pieces.some((p) => p.production_status === "not_sent")) toExpand.add(g.project.id);
    }
    setExpanded(toExpand);
  }, [groups.length]);

  useEffect(() => {
    if (!pendingProjectId || groups.length === 0) return;
    const g = groups.find((x) => x.project.id === pendingProjectId);
    if (!g) return;
    void (async () => {
      await openOrCreateStudy(g);
      onPendingProjectHandled?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProjectId, groups.length]);

  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`nomenclature-list-${staffUser.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pieces_tasks", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "nomenclatures", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "piece_costing_operations", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "piece_costing_materials", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [staffUser?.company_id, load]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        // On ne montre que les pièces non encore envoyées en production
        pieces: g.pieces.filter((p) => p.production_status === "not_sent"),
      }))
      .filter((g) => g.pieces.length > 0)
      .filter((g) => {
        if (clientFilter && g.project.client_id !== clientFilter) return false;
        if (statusFilter && !g.pieces.some((p) => p.costing_status === statusFilter)) return false;
        if (q) {
          const matchProject =
            g.project.name.toLowerCase().includes(q) ||
            (g.project.code ?? "").toLowerCase().includes(q);
          const matchPiece = g.pieces.some(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.code ?? "").toLowerCase().includes(q)
          );
          if (!matchProject && !matchPiece) return false;
        }
        return true;
      });
  }, [groups, searchQuery, clientFilter, statusFilter]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function ensureStudy(g: ProjectGroup): Promise<Nomenclature | null> {
    if (g.study) return g.study;
    if (!staffUser) return null;
    const { data } = await supabase
      .from("nomenclatures")
      .insert({
        company_id: staffUser.company_id,
        project_id: g.project.id,
        name: g.project.name,
        created_by: staffUser.id,
      })
      .select()
      .single();
    return (data as Nomenclature) ?? null;
  }

  async function openOrCreateStudy(g: ProjectGroup) {
    const study = await ensureStudy(g);
    if (!study) return;
    const first = g.pieces.find((p) => p.costing_status !== "valide") ?? g.pieces[0];
    if (first) onOpenPiece(study, first.id);
  }

  async function handleOpenPiece(g: ProjectGroup, piece: PieceWithCosting) {
    const study = await ensureStudy(g);
    if (!study) return;
    onOpenPiece(study, piece.id);
  }

  async function handleSendToProduction(g: ProjectGroup, piece: PieceWithCosting) {
    if (piece.costing_status !== "valide") return;
    setSendingId(piece.id);
    try {
      await supabase
        .from("pieces_tasks")
        .update({
          production_status: "sent",
          sent_to_production_at: new Date().toISOString(),
        } as never)
        .eq("id", piece.id);

      // Vérifier si toutes les pièces du projet sont envoyées → projet prêt
      const { data: siblingPieces } = await supabase
        .from("pieces_tasks")
        .select("production_status")
        .eq("project_id", g.project.id);

      const all = (siblingPieces ?? []) as { production_status: ProductionStatus }[];
      if (all.length > 0 && all.every((p) => p.production_status === "sent")) {
        await supabase
          .from("projects")
          .update({
            status: "ready_for_production",
            sent_to_production_at: new Date().toISOString(),
          } as never)
          .eq("id", g.project.id);
      }
      await load();
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("setup.searchProjectToStudy")}
              className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t("setup.allClients")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CostingStatus | "")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Tous les statuts</option>
            <option value="non_etudie">Non étudié</option>
            <option value="brouillon">Brouillon</option>
            <option value="en_attente">En attente</option>
            <option value="valide">Validé</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          {t("setup.noDataYet")}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const isOpen = expanded.has(g.project.id);
            const validatedPieces = g.pieces.filter((p) => p.costing_status === "valide");
            return (
              <div key={g.project.id} className="rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleExpand(g.project.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-slate-50"
                >
                  {isOpen ? <ChevronDown size={16} className="shrink-0 text-slate-400" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
                  <FolderOpen size={16} className="shrink-0 text-indigo-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-800">{g.project.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono" dir="ltr">{g.project.code}</span>
                      {g.client && <span>· {g.client.name}</span>}
                      <span>· {g.pieces.length} {g.pieces.length === 1 ? "pièce" : "pièces"}</span>
                      {validatedPieces.length > 0 && (
                        <span className="text-green-600">· {validatedPieces.length} prête(s) production</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="text-sm font-extrabold text-indigo-700" dir="ltr">
                      {g.totalCost.toFixed(2)} <span className="text-[10px] font-medium text-indigo-400">TND</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100">
                    {g.pieces.map((piece) => {
                      const meta = STATUS_META[piece.costing_status];
                      const { Icon } = meta;
                      const canSend = piece.costing_status === "valide";
                      const isSending = sendingId === piece.id;
                      return (
                        <div
                          key={piece.id}
                          className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0"
                        >
                          <Package size={14} className="shrink-0 text-slate-400" />
                          <button
                            type="button"
                            onClick={() => void handleOpenPiece(g, piece)}
                            className="min-w-0 flex-1 text-start"
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-700">{piece.name}</span>
                              <span className="shrink-0 font-mono text-[11px] text-slate-400" dir="ltr">{piece.code}</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              {piece.material && <span>{piece.material}</span>}
                              {(piece as unknown as { quantity?: number }).quantity && (
                                <span>· Qté {(piece as unknown as { quantity: number }).quantity}</span>
                              )}
                              {piece.estimated_time_minutes && (
                                <span>· {Math.floor(piece.estimated_time_minutes / 60)}h{piece.estimated_time_minutes % 60}</span>
                              )}
                            </div>
                          </button>
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.color}`}>
                            <Icon size={10} />
                            {meta.label}
                          </span>
                          <div className="w-20 shrink-0 text-end font-bold text-slate-700" dir="ltr">
                            {piece.study_total > 0 ? piece.study_total.toFixed(2) : "—"}
                          </div>
                          {canSend ? (
                            <button
                              type="button"
                              disabled={isSending}
                              onClick={() => void handleSendToProduction(g, piece)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                              title="Envoyer cette pièce en production"
                            >
                              <Send size={11} />
                              {isSending ? "..." : "Envoyer"}
                            </button>
                          ) : (
                            <div className="w-[86px] shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && filteredGroups.some((g) => g.pieces.length === 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Certains projets n'ont aucune pièce. Ajoutez-les depuis « Projets à étudier ».</span>
        </div>
      )}
    </div>
  );
}