import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Phone, Mail, Calendar, StickyNote, Plus, ArrowRightCircle, X } from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../../setup/components/AdminField";
import {
  fetchProspects, createProspect, updateProspectStage, convertProspectToClient,
  fetchInteractions, addInteraction,
  PIPELINE_STAGES, type Prospect, type PipelineStage, type CrmInteraction,
} from "../api/crmApi";

const STAGE_COLORS: Record<PipelineStage, string> = {
  new: "bg-slate-100 text-slate-600",
  contacted: "bg-blue-100 text-blue-700",
  qualified: "bg-indigo-100 text-indigo-700",
  proposal: "bg-amber-100 text-amber-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-600",
};

const INTERACTION_ICONS = { call: Phone, email: Mail, meeting: Calendar, note: StickyNote };

export function CrmPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [selected, setSelected] = useState<Prospect | null>(null);

  async function load() {
    setProspects(await fetchProspects());
  }
  useEffect(() => {
    void load();
  }, []);

  const columns: PipelineStage[] = ["new", "contacted", "qualified", "proposal"];
  const closedProspects = prospects.filter((p) => p.pipeline_stage === "won" || p.pipeline_stage === "lost");

  async function handleStageChange(prospect: Prospect, stage: PipelineStage) {
    await updateProspectStage(prospect.id, stage);
    await load();
  }

  async function handleConvert(prospect: Prospect) {
    if (!window.confirm(t("crm.convertConfirm"))) return;
    await convertProspectToClient(prospect.id);
    setSelected(null);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t("crm.pipelineTitle")}</h2>
          <p className="text-sm text-slate-400">{t("crm.subtitle")}</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> {t("crm.newProspect")}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {columns.map((stage) => (
          <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <p className={`mb-2 rounded-md px-2 py-1 text-center text-xs font-bold ${STAGE_COLORS[stage]}`}>
              {t(`crm.stage.${stage}`)} ({prospects.filter((p) => p.pipeline_stage === stage).length})
            </p>
            <div className="flex flex-col gap-2">
              {prospects
                .filter((p) => p.pipeline_stage === stage)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="rounded-lg border border-slate-200 bg-white p-2.5 text-start text-sm shadow-sm hover:border-indigo-300"
                  >
                    <p className="font-semibold text-slate-700">{p.name}</p>
                    {p.estimated_value != null && (
                      <p className="text-xs text-slate-400" dir="ltr">
                        {p.estimated_value.toLocaleString()} €
                      </p>
                    )}
                  </button>
                ))}
              {prospects.filter((p) => p.pipeline_stage === stage).length === 0 && (
                <p className="py-3 text-center text-xs text-slate-300">{t("crm.noProspects")}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {closedProspects.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {t("crm.stage.won")} / {t("crm.stage.lost")}
          </p>
          <div className="flex flex-wrap gap-2">
            {closedProspects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${STAGE_COLORS[p.pipeline_stage]}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isCreating && staffUser && (
        <NewProspectModal
          companyId={staffUser.company_id}
          onClose={() => setIsCreating(false)}
          onCreated={async () => {
            setIsCreating(false);
            await load();
          }}
        />
      )}

      {selected && (
        <ProspectDetailModal
          prospect={selected}
          onClose={() => setSelected(null)}
          onStageChange={(stage) => void handleStageChange(selected, stage)}
          onConvert={() => void handleConvert(selected)}
        />
      )}
    </div>
  );
}

function NewProspectModal({
  companyId,
  onClose,
  onCreated,
}: {
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const { error: insertError } = await createProspect({
        company_id: companyId,
        name,
        contact_person: contactPerson,
        phone,
        email,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
      });
      if (insertError) {
        setError(t("crm.saveError"));
        return;
      }
      onCreated();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{t("crm.newProspect")}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <AdminField label={t("setup.clientName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} required />
        </AdminField>
        <AdminField label={t("setup.contactPerson")}>
          <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={adminInputClass} />
        </AdminField>
        <AdminField label={t("setup.phone")}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={adminInputClass} dir="ltr" />
        </AdminField>
        <AdminField label={t("auth.email")}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={adminInputClass} dir="ltr" />
        </AdminField>
        <AdminField label={t("crm.estimatedValue")}>
          <input
            type="number"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            className={adminInputClass}
            dir="ltr"
          />
        </AdminField>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("common.save")}
        </button>
      </form>
    </div>
  );
}

function ProspectDetailModal({
  prospect,
  onClose,
  onStageChange,
  onConvert,
}: {
  prospect: Prospect;
  onClose: () => void;
  onStageChange: (stage: PipelineStage) => void;
  onConvert: () => void;
}) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [type, setType] = useState<CrmInteraction["interaction_type"]>("call");
  const [summary, setSummary] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setInteractions(await fetchInteractions(prospect.id));
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id]);

  async function handleAddInteraction(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !summary.trim()) return;
    setIsSaving(true);
    try {
      await addInteraction({ company_id: staffUser.company_id, client_id: prospect.id, interaction_type: type, summary });
      setSummary("");
      await load();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{prospect.name}</h3>
            <p className="text-xs text-slate-400">{prospect.phone || prospect.email || "—"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={prospect.pipeline_stage}
              onChange={(e) => onStageChange(e.target.value as PipelineStage)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(`crm.stage.${s}`)}
                </option>
              ))}
            </select>
            {prospect.pipeline_stage !== "won" && (
              <button
                onClick={onConvert}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <ArrowRightCircle size={15} /> {t("crm.convertToClient")}
              </button>
            )}
          </div>

          <h4 className="mb-2 text-sm font-bold text-slate-700">{t("crm.interactions")}</h4>
          <div className="mb-3 flex flex-col gap-2">
            {interactions.map((i) => {
              const Icon = INTERACTION_ICONS[i.interaction_type];
              return (
                <div key={i.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm">
                  <Icon size={15} className="mt-0.5 shrink-0 text-indigo-500" />
                  <div>
                    <p className="text-slate-700">{i.summary}</p>
                    <p className="text-xs text-slate-400">{new Date(i.occurred_at).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
            {interactions.length === 0 && <p className="text-xs text-slate-300">{t("crm.noInteractions")}</p>}
          </div>

          <form onSubmit={handleAddInteraction} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <div className="flex gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CrmInteraction["interaction_type"])}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              >
                {(["call", "email", "meeting", "note"] as const).map((it) => (
                  <option key={it} value={it}>
                    {t(`crm.interactionType.${it}`)}
                  </option>
                ))}
              </select>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={t("crm.summary")}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !summary.trim()}
              className="self-end rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t("crm.addInteraction")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
