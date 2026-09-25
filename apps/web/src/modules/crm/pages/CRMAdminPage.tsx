import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users, Plus, Search, Target, TrendingUp, DollarSign,
  Phone, Mail, Calendar, FileText, Loader2, UserCheck,
  Pencil, Trash2, XCircle,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { ProspectModal } from "../components/ProspectModal";
import { InteractionModal } from "../components/InteractionModal";
import {
  listProspects,
  createProspect,
  updateProspect,
  deleteProspect,
  listInteractions,
  createInteraction,
  convertProspectToClient,
  createProjectFromProspect,
  type Prospect,
  type Interaction,
  type ProspectStage,
  type ProspectPriority,
} from "../api/crmApi";

type TabKey = "pipeline" | "prospects";

const STAGES: ProspectStage[] = [
  "nouveau", "qualification", "etude", "chiffrage", "offre", "negociation", "gagne", "perdu",
];

const STAGE_COLORS: Record<ProspectStage, { bg: string; text: string; border: string }> = {
  nouveau:       { bg: "bg-slate-50",   text: "text-slate-700",   border: "border-slate-200" },
  qualification: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200" },
  etude:         { bg: "bg-cyan-50",    text: "text-cyan-700",    border: "border-cyan-200" },
  chiffrage:     { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
  offre:         { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200" },
  negociation:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  gagne:         { bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200" },
  perdu:         { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200" },
};

const STAGE_LABEL_KEY: Record<ProspectStage, string> = {
  nouveau:       "crm.stageNouveau",
  qualification: "crm.stageQualification",
  etude:         "crm.stageEtude",
  chiffrage:     "crm.stageChiffrage",
  offre:         "crm.stageOffre",
  negociation:   "crm.stageNegociation",
  gagne:         "crm.stageGagne",
  perdu:         "crm.stagePerdu",
};

const PRIORITY_COLORS: Record<ProspectPriority, string> = {
  basse:   "bg-slate-100 text-slate-500",
  normale: "bg-blue-100 text-blue-600",
  haute:   "bg-amber-100 text-amber-700",
  urgente: "bg-red-100 text-red-700",
};

interface CRMAdminPageProps {
  initialTab?: TabKey;
}

export function CRMAdminPage({ initialTab = "pipeline" }: CRMAdminPageProps = {}) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");

  const [showProspectModal, setShowProspectModal] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);

  const [activeProspect, setActiveProspect] = useState<Prospect | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState<string | null>(null);
  const [createdProjectCode, setCreatedProjectCode] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------
  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listProspects();
      setProspects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setCreatedProjectCode(null);
    if (!activeProspect) {
      setInteractions([]);
      return;
    }
    void listInteractions(activeProspect.id)
      .then(setInteractions)
      .catch(() => setInteractions([]));
  }, [activeProspect]);

  // ---------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------
  const kpis = useMemo(() => {
    const total = prospects.length;
    const active = prospects.filter((p) => p.stage !== "gagne" && p.stage !== "perdu").length;
    const won = prospects.filter((p) => p.stage === "gagne").length;
    const pipelineValue = prospects
      .filter((p) => p.stage !== "gagne" && p.stage !== "perdu")
      .reduce((sum, p) => sum + (p.estimated_value ?? 0), 0);
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;

    return { total, active, won, pipelineValue, conversionRate };
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prospects;
    return prospects.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.company_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q),
    );
  }, [prospects, search]);

  const byStage = useMemo(() => {
    const map: Record<ProspectStage, Prospect[]> = {
      nouveau: [], qualification: [], etude: [], chiffrage: [], offre: [],
      negociation: [], gagne: [], perdu: [],
    };
    for (const p of filteredProspects) {
      map[p.stage].push(p);
    }
    return map;
  }, [filteredProspects]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  async function handleSaveProspect(data: Partial<Prospect>) {
    if (!staffUser) return;
    if (editingProspect) {
      await updateProspect(editingProspect.id, data);
    } else {
      await createProspect(
        {
          full_name: data.full_name ?? "",
          company_name: data.company_name ?? null,
          contact_person: data.contact_person ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          source: data.source ?? null,
          notes: data.notes ?? null,
          stage: data.stage ?? "nouveau",
          priority: data.priority ?? "normale",
          estimated_value: data.estimated_value ?? null,
          probability: data.probability ?? null,
          expected_close_at: data.expected_close_at ?? null,
          requested_date: data.requested_date ?? null,
          owner_staff_id: data.owner_staff_id ?? staffUser.id,
        },
        staffUser.company_id,
      );
    }
    setShowProspectModal(false);
    setEditingProspect(null);
    await load();
  }

  async function handleDelete(prospect: Prospect) {
    if (!window.confirm(t("crm.confirmDelete"))) return;
    await deleteProspect(prospect.id);
    if (activeProspect?.id === prospect.id) setActiveProspect(null);
    await load();
  }

  async function handleStageChange(prospect: Prospect, newStage: ProspectStage) {
    await updateProspect(prospect.id, { stage: newStage });
    await load();
  }

  async function handleAddInteraction(data: {
    type: "appel" | "email" | "rdv" | "note";
    summary: string;
    happened_at: string;
    author_staff_id: string | null;
  }) {
    if (!staffUser || !activeProspect) return;
    await createInteraction(
      { ...data, prospect_id: activeProspect.id },
      staffUser.company_id,
    );
    const refreshed = await listInteractions(activeProspect.id);
    setInteractions(refreshed);
  }

  async function handleConvert(prospect: Prospect) {
    if (!staffUser) return;
    if (!window.confirm(t("crm.confirmConvert"))) return;
    setConverting(prospect.id);
    try {
      await convertProspectToClient(prospect, staffUser.company_id);
      await load();
    } finally {
      setConverting(null);
    }
  }

  async function handleCreateProject(prospect: Prospect) {
    if (!staffUser) return;
    if (!window.confirm(t("crm.confirmCreateProject"))) return;
    setCreatingProject(prospect.id);
    try {
      const result = await createProjectFromProspect(prospect, staffUser.company_id);
      setCreatedProjectCode(result.projectCode);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setCreatingProject(null);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">{t("crm.title")}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("crm.subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setEditingProspect(null);
            setShowProspectModal(true);
          }}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus size={16} />
          {t("crm.addProspect")}
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
            <Users size={13} /> {t("crm.kpiTotal")}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-800">{kpis.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
            <Target size={13} /> {t("crm.kpiActive")}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-blue-600">{kpis.active}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
            <DollarSign size={13} /> {t("crm.kpiPipelineValue")}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-indigo-600">
            {kpis.pipelineValue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            <span className="ms-1 text-xs font-medium text-slate-400">TND</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
            <TrendingUp size={13} /> {t("crm.kpiConversion")}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-green-600">
            {kpis.conversionRate}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["pipeline", "prospects"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t(`crm.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Search (prospects tab) */}
      {activeTab === "prospects" && (
        <div className="relative max-w-sm">
          <Search
            size={15}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      )}

      {/* Contenu */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="me-2 animate-spin" size={18} />
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : prospects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Users size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">{t("crm.empty")}</p>
        </div>
      ) : (
        <>
          {/* Vue Pipeline */}
          {activeTab === "pipeline" && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {STAGES.map((stage) => (
                <div
                  key={stage}
                  className={`w-64 shrink-0 rounded-xl border ${STAGE_COLORS[stage].border} ${STAGE_COLORS[stage].bg} p-3`}
                >
                  <div
                    className={`mb-3 flex items-center justify-between text-xs font-bold ${STAGE_COLORS[stage].text}`}
                  >
                    <span>{t(STAGE_LABEL_KEY[stage])}</span>
                    <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px]">
                      {byStage[stage].length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {byStage[stage].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActiveProspect(p)}
                        className="w-full rounded-lg border border-white bg-white p-2.5 text-start shadow-sm transition-all hover:shadow-md"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="text-sm font-semibold text-slate-800">
                            {p.full_name}
                          </div>
                          {p.priority !== "normale" && (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${PRIORITY_COLORS[p.priority]}`}
                            >
                              {t(
                                `crm.priority${p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}`,
                              )}
                            </span>
                          )}
                        </div>
                        {p.company_name && (
                          <div className="text-xs text-slate-500">{p.company_name}</div>
                        )}
                        {p.estimated_value != null && (
                          <div className="mt-1 text-xs font-bold text-indigo-600">
                            {p.estimated_value.toLocaleString("fr-FR")} TND
                          </div>
                        )}
                      </button>
                    ))}
                    {byStage[stage].length === 0 && (
                      <div className="py-3 text-center text-[11px] text-slate-400">—</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vue Liste */}
          {activeTab === "prospects" && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("crm.colName")}</th>
                    <th className="px-3 py-2 text-start">{t("crm.colCompany")}</th>
                    <th className="px-3 py-2 text-start">{t("crm.colStage")}</th>
                    <th className="px-3 py-2 text-end">{t("crm.colValue")}</th>
                    <th className="px-3 py-2 text-center">{t("common.edit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProspects.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setActiveProspect(p)}
                          className="font-semibold text-slate-700 hover:text-indigo-600"
                        >
                          {p.full_name}
                        </button>
                        {p.email && (
                          <div className="text-xs text-slate-400" dir="ltr">
                            {p.email}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{p.company_name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <select
                          value={p.stage}
                          onChange={(e) =>
                            void handleStageChange(p, e.target.value as ProspectStage)
                          }
                          className={`rounded border px-2 py-0.5 text-xs font-semibold ${STAGE_COLORS[p.stage].bg} ${STAGE_COLORS[p.stage].text} ${STAGE_COLORS[p.stage].border}`}
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {t(STAGE_LABEL_KEY[s])}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-end font-semibold text-slate-700" dir="ltr">
                        {p.estimated_value != null
                          ? `${p.estimated_value.toLocaleString("fr-FR")} TND`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingProspect(p);
                              setShowProspectModal(true);
                            }}
                            className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                            title={t("common.edit")}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => void handleDelete(p)}
                            className="rounded p-1.5 text-red-500 hover:bg-red-50"
                            title={t("common.delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal Prospect */}
      {showProspectModal && (
        <ProspectModal
          prospect={editingProspect}
          onClose={() => {
            setShowProspectModal(false);
            setEditingProspect(null);
          }}
          onSave={handleSaveProspect}
        />
      )}

      {/* Panneau latéral : détails */}
      {activeProspect && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
          onClick={() => setActiveProspect(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h2 className="text-base font-extrabold text-slate-800">
                {activeProspect.full_name}
              </h2>
              <button
                onClick={() => setActiveProspect(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${PRIORITY_COLORS[activeProspect.priority]}`}
                  >
                    {t(
                      `crm.priority${activeProspect.priority.charAt(0).toUpperCase() + activeProspect.priority.slice(1)}`,
                    )}
                  </span>
                  {activeProspect.requested_date && (
                    <span className="text-xs text-slate-400">
                      {t("crm.requestedDate")}:{" "}
                      {new Date(activeProspect.requested_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {activeProspect.company_name && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <UserCheck size={14} className="text-slate-400" />
                    {activeProspect.company_name}
                  </div>
                )}
                {activeProspect.contact_person && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users size={14} className="text-slate-400" />
                    {activeProspect.contact_person}
                  </div>
                )}
                {activeProspect.email && (
                  <div className="flex items-center gap-2 text-slate-600" dir="ltr">
                    <Mail size={14} className="text-slate-400" />
                    {activeProspect.email}
                  </div>
                )}
                {activeProspect.phone && (
                  <div className="flex items-center gap-2 text-slate-600" dir="ltr">
                    <Phone size={14} className="text-slate-400" />
                    {activeProspect.phone}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowInteractionModal(true)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + {t("crm.addInteraction")}
                </button>
                {activeProspect.stage !== "gagne" && (
                  <button
                    onClick={() => void handleConvert(activeProspect)}
                    disabled={converting === activeProspect.id}
                    className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {converting === activeProspect.id ? (
                      <Loader2 size={12} className="mx-auto animate-spin" />
                    ) : (
                      t("crm.convertToClient")
                    )}
                  </button>
                )}
                {activeProspect.stage === "gagne" && (
                  <button
                    onClick={() => void handleCreateProject(activeProspect)}
                    disabled={creatingProject === activeProspect.id}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creatingProject === activeProspect.id ? (
                      <Loader2 size={12} className="mx-auto animate-spin" />
                    ) : (
                      t("crm.createProjectButton")
                    )}
                  </button>
                )}
              </div>

              {createdProjectCode && (
                <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                  {t("crm.projectCreatedSuccess", { code: createdProjectCode })}
                </div>
              )}

              {/* Historique des interactions */}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">
                  {t("crm.tabs.interactions")}
                </h3>
                {interactions.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
                    {t("crm.noInteractions")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {interactions.map((it) => {
                      const Icon =
                        it.type === "appel"
                          ? Phone
                          : it.type === "email"
                            ? Mail
                            : it.type === "rdv"
                              ? Calendar
                              : FileText;
                      return (
                        <li
                          key={it.id}
                          className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <Icon size={12} className="text-indigo-500" />
                            {t(
                              `crm.interactionType${it.type.charAt(0).toUpperCase() + it.type.slice(1)}`,
                            )}
                            <span className="ms-auto text-slate-400">
                              {new Date(it.happened_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-700">{it.summary}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Modal Interaction */}
      {showInteractionModal && activeProspect && (
        <InteractionModal
          prospectId={activeProspect.id}
          onClose={() => setShowInteractionModal(false)}
          onSave={handleAddInteraction}
        />
      )}
    </div>
  );
}