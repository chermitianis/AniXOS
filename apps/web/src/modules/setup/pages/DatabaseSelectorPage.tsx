import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Database, CheckCircle2, Loader2, Plus, ArrowRight } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { setActiveCompany } from "../../../lib/activeCompany";
import { CreateDatabaseModal } from "../components/CreateDatabaseModal";

interface DatabaseRow {
  database_id: string;
  company_id: string;
  company_name: string;
  database_name: string;
  is_owner: boolean;
}

interface DatabaseSelectorPageProps {
  onSelected: () => void;
  onLogout: () => void;
}

export function DatabaseSelectorPage({ onSelected, onLogout }: DatabaseSelectorPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [databases, setDatabases] = useState<DatabaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [maxDatabases, setMaxDatabases] = useState<number>(5);
  const [reloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const { data: accountData } = await supabase
          .from("accounts")
          .select("max_databases")
          .maybeSingle();

        if (isMounted && accountData?.max_databases) {
          setMaxDatabases(accountData.max_databases);
        }

        const { data, error: rpcError } = await supabase.rpc("list_my_databases");
        if (rpcError) throw rpcError;
        if (!isMounted) return;
        const rows = (data as DatabaseRow[] | null) ?? [];

        if (rows.length === 1) {
          await handleSelectInternal(rows[0].company_id, rows[0].is_owner);
          return;
        }

        setDatabases(rows);
        if (rows.length === 0) {
          setError(t("databaseSelector.noDatabases"));
        }
      } catch (err) {
        console.error("[DatabaseSelectorPage]", err);
        if (isMounted) setError(t("databaseSelector.loadError"));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  async function handleSelectInternal(companyId: string, isOwner: boolean) {
    if (isOwner) {
      const result = await setActiveCompany(companyId);
      if (!result.success) {
        setError(t("databaseSelector.selectError"));
        setSelectingId(null);
        return;
      }
    } else {
      try {
        localStorage.setItem("anixos_active_company_id", companyId);
      } catch {
        /* ignore */
      }
    }
    onSelected();
  }

  async function handleSelect(row: DatabaseRow) {
    setSelectingId(row.company_id);
    setError(null);
    await handleSelectInternal(row.company_id, row.is_owner);
  }

  async function handleDatabaseCreated(companyId: string) {
    setShowCreateModal(false);
    await handleSelectInternal(companyId, true);
  }

  const isOwner = databases.some((d) => d.is_owner);
  const canAddMore = isOwner && databases.length < maxDatabases;

  return (
    <>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-3 sm:p-4">
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-white p-5 shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-300">
              <Database size={26} />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800 sm:text-xl">
              {t("databaseSelector.title")}
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{t("databaseSelector.subtitle")}</p>
            {staffUser?.full_name && (
              <p className="mt-1 text-xs text-slate-400">
                {t("databaseSelector.welcome", { name: staffUser.full_name })}
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="me-2 animate-spin" size={18} />
              {t("common.loading")}
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {databases.map((db) => {
                  const isSelecting = selectingId === db.company_id;
                  return (
                    <button
                      key={db.database_id}
                      onClick={() => void handleSelect(db)}
                      disabled={isSelecting}
                      className={`group relative rounded-xl border-2 border-slate-200 bg-white p-4 text-start transition-all hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md disabled:opacity-60 ${
                        isSelecting ? "border-indigo-500 bg-indigo-50" : ""
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                          <Database size={18} />
                        </div>
                        {isSelecting ? (
                          <Loader2 className="animate-spin text-indigo-600" size={16} />
                        ) : (
                          <ArrowRight
                            size={16}
                            className="text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600 rtl:group-hover:-translate-x-1 rtl:rotate-180"
                          />
                        )}
                      </div>
                      <div className="mb-0.5 truncate text-sm font-bold text-slate-800">
                        {db.company_name}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        <span className="truncate font-mono" dir="ltr">{db.database_name}</span>
                        {db.is_owner && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 size={9} />
                            {t("databaseSelector.ownerBadge")}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {canAddMore && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="flex min-h-[100px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-center text-indigo-600 transition-all hover:border-indigo-500 hover:bg-indigo-50"
                  >
                    <Plus size={22} className="mb-1" />
                    <span className="text-xs font-bold">{t("databaseSelector.addNew")}</span>
                    <span className="mt-0.5 text-[10px] text-indigo-400">
                      {databases.length} / {maxDatabases}
                    </span>
                  </button>
                )}

                {isOwner && !canAddMore && (
                  <div className="flex min-h-[100px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/40 p-4 text-center text-amber-600">
                    <Plus size={20} className="mb-1 opacity-50" />
                    <span className="text-xs font-bold">
                      {t("databaseSelector.limitReachedShort")}
                    </span>
                    <span className="mt-0.5 text-[10px] text-amber-500">
                      {databases.length} / {maxDatabases}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4 text-center">
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-sm font-medium text-slate-500 hover:text-indigo-600"
                >
                  {t("common.logout")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateDatabaseModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleDatabaseCreated}
          maxDatabases={maxDatabases}
          currentCount={databases.length}
        />
      )}
    </>
  );
}