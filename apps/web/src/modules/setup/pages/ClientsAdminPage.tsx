import { useTranslation } from "react-i18next";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { Client } from "../../../shared/types/database";

export type ClientWithCode = Client & { code: string | null };

export function ClientsAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientWithCode[]>([]);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadClients() {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as ClientWithCode[]) ?? []);
  }

  useEffect(() => {
    void loadClients();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    try {
      const { error: insertError } = await supabase.from("clients").insert({
        company_id: staffUser.company_id,
        name,
        contact_person: contactPerson || null,
        phone: phone || null,
        email: email || null,
      });

      if (insertError) {
        setError(t("setup.genericError"));
        return;
      }

      setName("");
      setContactPerson("");
      setPhone("");
      setEmail("");
      await loadClients();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.addClient")}
        </h2>

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

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.addClient")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.clientsList")} ({clients.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {clients.map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 rounded-md bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700" dir="ltr">
                  {c.code ?? "—"}
                </span>
                <span className="truncate font-semibold text-slate-700">{c.name}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-400">
                {c.contact_person && `${c.contact_person} — `}
                {c.phone}
              </div>
            </li>
          ))}
          {clients.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>
    </div>
  );
}