import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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

  const [acceptingQuote, setAcceptingQuote] = useState<Quote | null>(null);
  const [acceptProjectName, setAcceptProjectName] = useState("");
  const [acceptProjectCode, setAcceptProjectCode] = useState("");
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

  useEffect(() => {
    void loadClients();
    void loadQuotes();
  }, []);

  function updateItem(index: number, field: keyof DraftItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const draftTotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  function openAcceptDialog(quote: Quote) {
    setAcceptingQuote(quote);
    setAcceptProjectName("");
    setAcceptProjectCode("");
    setAcceptError(null);
  }

  async function handleAcceptQuote(e: FormEvent) {
    e.preventDefault();
    if (!acceptingQuote) return;
    setAcceptError(null);
    setIsAccepting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("accept-quote", {
        body: {
          quote_id: acceptingQuote.id,
          project_name: acceptProjectName,
          project_code: acceptProjectCode,
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
        })
        .select()
        .single();

      if (insertError || !quote) {
        setError(insertError?.message.includes("duplicate") ? t("setup.usernameTaken") : "Erreur");
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
          }))
        );
      }

      setQuoteNumber("");
      setValidUntil("");
      setItems([{ ...emptyItem }]);
      await loadQuotes();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.createQuote")}</h2>

        <AdminField label={t("setup.client")}>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={adminInputClass} required>
            <option value="">{t("setup.selectWorker")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField label={t("setup.quoteNumber")}>
          <input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.validUntil")}>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={adminInputClass} />
        </AdminField>

        <p className="mb-2 text-sm font-semibold text-slate-600">{t("setup.items")}</p>
        {items.map((item, index) => (
          <div key={index} className="mb-2 flex gap-2">
            <input
              value={item.description}
              onChange={(e) => updateItem(index, "description", e.target.value)}
              placeholder={t("setup.description")}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => updateItem(index, "quantity", e.target.value)}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={item.unit_price}
              onChange={(e) => updateItem(index, "unit_price", e.target.value)}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            {items.length > 1 && (
              <button type="button" onClick={() => removeItemRow(index)} className="text-red-400">
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addItemRow} className="mb-3 text-sm font-semibold text-blue-600">
          {t("setup.addItem")}
        </button>

        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700" dir="ltr">
          {t("setup.totalLabel")}: {draftTotal.toFixed(2)}
        </div>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving || !clientId}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.createQuote")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.quotesList")} ({quotes.length})</h2>
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => (
            <li key={q.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  {q.quote_number} — {q.client_name}
                </span>
                <span className="font-bold text-slate-800" dir="ltr">
                  {(q.total ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    q.status === "accepted" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {q.status === "accepted" ? t("setup.accepted") : q.status === "draft" ? t("setup.draft") : q.status}
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
          {quotes.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>

      {acceptingQuote && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAcceptQuote} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h3 className="mb-1 text-lg font-bold text-slate-800">{t("setup.acceptQuoteTitle")} {acceptingQuote.quote_number}</h3>
            <p className="mb-4 text-sm text-slate-400">
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

            <AdminField label={t("setup.projectCode")}>
              <input
                value={acceptProjectCode}
                onChange={(e) => setAcceptProjectCode(e.target.value)}
                className={adminInputClass}
                required
              />
            </AdminField>

            {acceptError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{acceptError}</div>}

            <div className="flex gap-2">
              <button type="button" onClick={() => setAcceptingQuote(null)} className="flex-1 rounded-lg py-2 text-sm text-slate-500">
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
