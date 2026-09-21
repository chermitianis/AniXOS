import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { CostingModal } from "../components/CostingModal";
import type { Project, Client } from "../../../shared/types/database";

/** Interface locale (pattern du repo : ne pas dépendre des types générés UTF-16LE) */
interface PieceRow {
  id: string;
  name: string;
  code: string | null;
  project_id: string;
  created_at: string;
}

export function CostingPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pieces, setPieces] = useState<PieceRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: projData }, { data: clientData }, { data: pieceData }] = await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase
        .from("pieces_tasks")
        .select("id, name, code, project_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setProjects((projData as Project[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setPieces((pieceData as PieceRow[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime : rafraîchit quand un projet ou une pièce change
  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`costing-page-${staffUser.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pieces_tasks", filter: `company_id=eq.${staffUser.company_id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, load]);

  /** Filtrage local : le projet restreint la liste, puis recherche et client */
  const filteredPieces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const projectClientMap = new Map(projects.map((p) => [p.id, p.client_id]));
    return pieces.filter((piece) => {
      if (selectedProjectId && piece.project_id !== selectedProjectId) return false;
      if (clientFilter && projectClientMap.get(piece.project_id) !== clientFilter) return false;
      if (q && !piece.name.toLowerCase().includes(q) && !(piece.code ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pieces, selectedProjectId, clientFilter, searchQuery, projects]);

  function togglePiece(id: string, checked: boolean) {
    setSelectedPieceIds((prev) =>
      checked ? [...prev, id] : prev.filter((pid) => pid !== id)
    );
  }

  function toggleAll(checked: boolean) {
    setSelectedPieceIds(checked ? filteredPieces.map((p) => p.id) : []);
  }

  const allFilteredSelected =
    filteredPieces.length > 0 && filteredPieces.every((p) => selectedPieceIds.includes(p.id));

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("etude.costing.searchPiecePlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-9 pe-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedPieceIds([]);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{t("etude.costing.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{t("setup.allClients")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={selectedPieceIds.length === 0}
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t("etude.costing.openSelected", { count: selectedPieceIds.length })}
          </button>
        </div>
      </div>

      {/* Liste des pièces */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-700">
            {t("etude.costing.recentPieces")}
          </h3>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-slate-400">
            {t("common.loading")}
          </div>
        ) : filteredPieces.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            {t("etude.costing.noPieces")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <th className="px-3 py-2.5 text-start">{t("setup.piece")}</th>
                <th className="px-3 py-2.5 text-start">{t("etude.costing.colProject")}</th>
                <th className="px-3 py-2.5 text-left" dir="ltr">
                  {t("etude.costing.colAddedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPieces.map((piece) => {
                const project = projects.find((p) => p.id === piece.project_id);
                const checked = selectedPieceIds.includes(piece.id);
                return (
                  <tr key={piece.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => togglePiece(piece.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-start">
                      <span className="font-semibold text-slate-700">{piece.name}</span>
                      {piece.code && (
                        <span className="ms-2 text-xs text-slate-400" dir="ltr">
                          {piece.code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-start text-slate-500">
                      {project?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left text-xs text-slate-400" dir="ltr">
                      {new Date(piece.created_at).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <CostingModal
          pieceIds={selectedPieceIds}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setSelectedPieceIds([]);
            void load();
          }}
        />
      )}
    </div>
  );
}