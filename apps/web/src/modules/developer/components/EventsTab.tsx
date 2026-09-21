import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Search, Filter } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface EventRow {
  id: string;
  account_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  performed_by: string | null;
  created_at: string;
}

interface AccountBasic {
  id: string;
  email: string;
  owner_full_name: string;
}

const EVENT_COLORS: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-700",
  database_created: "bg-indigo-100 text-indigo-700",
  suspended: "bg-red-100 text-red-700",
  unsuspended: "bg-amber-100 text-amber-700",
  deleted: "bg-slate-200 text-slate-600",
  plan_changed: "bg-violet-100 text-violet-700",
  payment: "bg-blue-100 text-blue-700",
  trial_extended: "bg-teal-100 text-teal-700",
  note_added: "bg-slate-100 text-slate-600",
};

export function EventsTab() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [accountsById, setAccountsById] = useState<Map<string, AccountBasic>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);

      const [eventsRes, accountsRes] = await Promise.all([
        supabase
          .from("account_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("accounts")
          .select("id, email, owner_full_name"),
      ]);

      if (!isMounted) return;

      setEvents((eventsRes.data as EventRow[] | null) ?? []);

      const map = new Map<string, AccountBasic>();
      for (const a of (accountsRes.data as AccountBasic[] | null) ?? []) {
        map.set(a.id, a);
      }
      setAccountsById(map);
      setIsLoading(false);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Unique event types (pour le filtre)
  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.event_type);
    return Array.from(set).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (eventTypeFilter && e.event_type !== eventTypeFilter) return false;
      if (q) {
        const account = accountsById.get(e.account_id);
        const haystack = `${account?.email ?? ""} ${account?.owner_full_name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, eventTypeFilter, accountsById]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("developer.events.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1.5">
            <Filter size={14} className="text-slate-400" />
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="border-0 bg-transparent text-sm text-slate-700 focus:outline-none"
            >
              <option value="">{t("developer.events.allEventTypes")}</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <Activity size={14} />
            {t("developer.events.title")} ({filtered.length} / {events.length})
          </h3>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {t("developer.events.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-start">{t("developer.events.colDate")}</th>
                  <th className="px-5 py-2.5 text-start">{t("developer.events.colType")}</th>
                  <th className="px-5 py-2.5 text-start">{t("developer.events.colAccount")}</th>
                  <th className="px-5 py-2.5 text-start">{t("developer.events.colPerformedBy")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const account = accountsById.get(e.account_id);
                  const colorClass = EVENT_COLORS[e.event_type] ?? "bg-slate-100 text-slate-600";
                  return (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-xs text-slate-500" dir="ltr">
                        {new Date(e.created_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${colorClass}`}>
                          {e.event_type}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {account ? (
                          <>
                            <div className="font-semibold text-slate-700">{account.owner_full_name}</div>
                            <div className="text-xs text-slate-400" dir="ltr">{account.email}</div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {e.performed_by ?? "system"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}