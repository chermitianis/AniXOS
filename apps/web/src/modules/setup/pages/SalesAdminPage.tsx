import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X as XIcon, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { Quote, Client } from "../../../shared/types/database";

interface DraftItem {
  description: string;
  quantity: string;
  unit_price: string;
}

const emptyItem: DraftItem = { description: "", quantity: "1", unit_price: "0" };

interface ValidatedNomenclature {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  client_id: string;
}

export function SalesAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<(Quote & { client_name?: string; total?: number })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [clientId, setClientId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ ...emptyItem }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [validatedNomenclatures, setValidatedNomenclatures] = useState<ValidatedNomenclature[]>([]);
  const [sourceNomenclatureId, setSourceNomenclatureId] = useState("");
  const [sourceProspectId, setSourceProspectId] = useState<string | null>(null);
  const [isLoadingFromNomenclature, setIsLoadingFromNomenclature] = useState(false);

  const [acceptingQuote, setAcceptingQuote] = useState<Quote | null>(null);
  const [acceptProjectName, setAcceptProjectName] = useState("");
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  async function loadClients() {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as Client[]) ?? []);
  }

  async function loadQuotes() {
    const { data } = await supabase
      .from("quotes")
      .select("*, clients(name), quote_items(quantity, unit_price)")
      .order("created_at", { ascending: false });

    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      const quoteItems = (row.quote_items as { quantity: number; unit_price: number }[] | null) ?? [];
      const total = quoteItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
      return {
        ...(row as unknown as Quote),
        client_name: (row.clients as { name?: string } | null)?.name,
        total,
      };
    });

    setQuotes(rows);
  }

  async function loadValidatedNomenclatures() {
    const { data } = await supabase
      .from("nomenclatures")
      .select("id, name, project_id, projects(name, client_id)")
      .eq("status", "valide")
      .not("project_id", "is", null)
      .order("validated_at", { ascending: false });

    const rows = ((data ?? []) as unknown as Array<{
      id: string;
      name: string;
      project_id: string;
      projects: { name: string; client_id: string } | null;
    }>)
      .filter((r) => r.projects)
      .map((r) => ({
        id: r.id,
        name: r.name,
        project_id: r.project_id,
        project_name: r.projects!.name,
        client_id: r.projects!.client_id,
      }));

    setValidatedNomenclatures(rows);
  }

  useEffect(() => {
    void loadClients();
    void loadQuotes();
    void loadValidatedNomenclatures();
  }, []);

  async function handlePickNomenclature(nomenclatureId: string) {
    setSourceNomenclatureId(nomenclatureId);
    setSourceProspectId(null);
    if (!nomenclatureId) return;

    const source = validatedNomenclatures.find((n) => n.id === nomenclatureId);
    if (!source) return;

    setIsLoadingFromNomenclature(true);
    try {
      setClientId(source.client_id);
      if (!quoteNumber) setQuoteNumber(`DEV-${source.project_name}`.slice(0, 40));

      const { data: project } = await supabase
        .from("projects")
        .select("opportunity_id")
        .eq("id", source.project_id)
        .maybeSingle();
      const opportunityId = (project as { opportunity_id: string | null } | null)?.opportunity_id ?? null;
      setSourceProspectId(opportunityId);

      const { data: pieces } = await supabase
        .from("pieces_tasks")
        .select("name, quantity, cnc_estimated_cost")
        .eq("project_id", source.project_id);

      const pieceRows = (pieces ?? []) as { name: string; quantity: number | null; cnc_estimated_cost: number | null }[];
      const nextItems: DraftItem[] = pieceRows
        .filter((p) => p.cnc_estimated_cost != null)
        .map((p) => ({
          description: p.name,
          quantity: String(p.quantity || 1),
          unit_price: String(p.cnc_estimated_cost ?? 0),
        }));

      setItems(nextItems.length > 0 ? nextItems : [{ ...emptyItem }]);
    } finally {
      setIsLoadingFromNomenclature(false);
    }
  }

  function updateItem(index: number, field: keyof DraftItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const draftTotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  );

  function openAcceptDialog(quote: Quote) {
    setAcceptingQuote(quote);
    setAcceptProjectName("");
    setAcceptError(null);
  }

  async function handleAcceptQuote(e: FormEvent) {
    e.preventDefault();
    if (!acceptingQuote) return;
    setAcceptError(null);
    setIsAccepting(true);

    try {
      // Le code du projet est désormais généré automatiquement par le trigger DB (0077).
      const { data, error: fnError } = await supabase.functions.invoke("accept-quote", {
        body: {
          quote_id: acceptingQuote.id,
          project_name: acceptProjectName,
        },
      });

      if (fnError || !data?.success) {
        setAcceptError(data?.message ?? "Erreur");
        return;
      }

      setAcceptingQuote(null);
      await loadQuotes();
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !clientId) return;
    setError(null);
    setIsSaving(true);

    try {
      const { data: quote, error: insertError } = await supabase
        .from("quotes")
        .insert({
          company_id: staffUser.company_id,
          client_id: clientId,
          quote_number: quoteNumber,
          valid_until: validUntil || null,
          created_by: staffUser.id,
          nomenclature_id: sourceNomenclatureId || null,
          prospect_id: sourceProspectId,
        } as never)
        .select()
        .single();

      if (insertError || !quote) {
        setError(
          insertError?.message.includes("duplicate")
            ? t("setup.usernameTaken")
            : "Erreur",
        );
        return;
      }

      const validItems = items.filter((it) => it.description.trim());
      if (validItems.length > 0) {
        await supabase.from("quote_items").insert(
          validItems.map((it, index) => ({
            quote_id: (quote as Quote).id,
            company_id: staffUser.company_id,
            description: it.description,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            sequence_order: index,
          })),
        );
      }

      setQuoteNumber("");
      setValidUntil("");
      setItems([{ ...emptyItem }]);
      setSourceNomenclatureId("");
      setSourceProspectId(null);
      await loadQuotes();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      {/* Formulaire de création */}
      <form
        onSubmit={handleSubmit}
        className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.createQuote")}
        </h2>

        {validatedNomenclatures.length > 0 && (
          <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-indigo-700">
              <FileSpreadsheet size={13} />
              {t("setup.fromValidatedChiffrage")}
            </label>
            <select
              value={sourceNomenclatureId}
              onChange={(e) => void handlePickNomenclature(e.target.value)}
              disabled={isLoadingFromNomenclature}
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">{t("setup.chooseChiffrage")}</option>
              {validatedNomenclatures.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.project_name} — {n.name}
                </option>
              ))}
            </select>
            {isLoadingFromNomenclature && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-indigo-500">
                <Loader2 size={11} className="animate-spin" /> {t("setup.loadingSimple")}
              </p>
            )}
          </div>
        )}

        <AdminField label={t("setup.client")}>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={adminInputClass}
            required
          >
            <option value="">{t("setup.noClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField label={t("setup.quoteNumber")}>
          <input
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            className={adminInputClass}
            required
          />
        </AdminField>

        <AdminField label={t("setup.validUntil")}>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={adminInputClass}
          />
        </AdminField>

        <p className="mb-2 text-sm font-semibold text-slate-600">{t("setup.items")}</p>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-slate-200 bg-slate-50/40 p-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  placeholder={t("setup.description")}
                  className="w-full flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                    placeholder={t("setup.quantity")}
                    className="w-16 shrink-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
                    dir="ltr"
                  />
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                    placeholder="TND"
                    className="w-20 shrink-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
                    dir="ltr"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(index)}
                      className="shrink-0 rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={t("common.delete")}
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addItemRow}
          className="mb-3 mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          <Plus size={14} />
          {t("setup.addItem")}
        </button>

        <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
          <span>{t("setup.totalLabel")}</span>
          <span dir="ltr">{draftTotal.toFixed(2)} TND</span>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving || !clientId}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.createQuote")}
        </button>
      </form>

      {/* Liste des devis */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.quotesList")} ({quotes.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => (
            <li key={q.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                  {q.quote_number} — {q.client_name}
                </span>
                <span className="shrink-0 font-bold text-slate-800" dir="ltr">
                  {(q.total ?? 0).toFixed(2)} TND
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    q.status === "accepted"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {q.status === "accepted"
                    ? t("setup.accepted")
                    : q.status === "draft"
                      ? t("setup.draft")
                      : q.status}
                </span>
                {q.status !== "accepted" && (
                  <button
                    onClick={() => openAcceptDialog(q)}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-bold text-white"
                  >
                    {t("setup.acceptQuote")}
                  </button>
                )}
              </div>
            </li>
          ))}
          {quotes.length === 0 && (
            <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>
          )}
        </ul>
      </div>

      {/* Modal accepter devis */}
      {acceptingQuote && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleAcceptQuote}
            className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg sm:p-5"
          >
            <h3 className="mb-1 text-base font-bold text-slate-800 sm:text-lg">
              {t("setup.acceptQuoteTitle")} {acceptingQuote.quote_number}
            </h3>
            <p className="mb-4 text-xs text-slate-400 sm:text-sm">
              {t("setup.acceptQuoteBody")}
            </p>

            <AdminField label={t("setup.projectName")}>
              <input
                value={acceptProjectName}
                onChange={(e) => setAcceptProjectName(e.target.value)}
                className={adminInputClass}
                required
                autoFocus
              />
            </AdminField>

            <p className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] text-indigo-600">
              {t("setup.codeAutoNotice")}
            </p>

            {acceptError && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {acceptError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAcceptingQuote(null)}
                className="flex-1 rounded-lg py-2 text-sm text-slate-500"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isAccepting}
                className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {isAccepting ? t("setup.acceptingBtn") : t("setup.confirmAccept")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}