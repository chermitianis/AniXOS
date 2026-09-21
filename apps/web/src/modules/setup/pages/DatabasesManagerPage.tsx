// ============================================================================
// DatabasesManagerPage — إدارة قواعد بيانات المالك (multi-database)
//
// الوظائف:
//   - عرض كل قواعد المالك الحالي
//   - تمييز القاعدة النشطة (ACTUELLE)
//   - Ouvrir: تبديل active_company + إعادة تحميل
//   - Supprimer: Modal تأكيد بكتابة اسم القاعدة
//   - Ajouter: عبر CreateDatabaseModal الموجود
//
// الحماية:
//   - owner-only (الموظف لا يرى الصفحة أساسًا)
//   - لا حذف القاعدة النشطة (يُتحقق في Modal + Edge Function)
//   - لا حذف آخر قاعدة (يُتحقق في Modal + Edge Function)
// ============================================================================

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  Settings,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { setActiveCompany, getActiveCompanyIdSync } from "../../../lib/activeCompany";
import { CreateDatabaseModal } from "../components/CreateDatabaseModal";
import { DeleteDatabaseModal } from "../components/DeleteDatabaseModal";

interface DatabaseRow {
  database_id: string;
  company_id: string;
  company_name: string;
  database_name: string;
  is_owner: boolean;
}

interface DatabasesManagerPageProps {
  onBack: () => void;
}

export function DatabasesManagerPage({ onBack }: DatabasesManagerPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [databases, setDatabases] = useState<DatabaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxDatabases, setMaxDatabases] = useState<number>(5);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() =>
    getActiveCompanyIdSync(),
  );
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseRow | null>(null);

  const isOwner = staffUser?.is_owner === true;

  // -------------------------------------------------------------------------
  // تحميل القواعد + الحد الأقصى + حالة المطور
  // -------------------------------------------------------------------------
  async function reload() {
    setIsLoading(true);
    setError(null);
    try {
      const { data: accountData } = await supabase
        .from("accounts")
        .select("max_databases, is_developer")
        .maybeSingle();

      if (accountData) {
        setMaxDatabases(accountData.max_databases ?? 5);
        setIsDeveloper(accountData.is_developer === true);
      }

      const { data, error: rpcError } = await supabase.rpc("list_my_databases");
      if (rpcError) throw rpcError;

      setDatabases((data as DatabaseRow[] | null) ?? []);
    } catch (err) {
      console.error("[DatabasesManagerPage]", err);
      setError(t("databasesManager.loadError"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Ouvrir: تبديل القاعدة النشطة + إعادة تحميل
  // -------------------------------------------------------------------------
  async function handleOpen(row: DatabaseRow) {
    setSwitchingId(row.company_id);
    setError(null);

    const result = await setActiveCompany(row.company_id);
    if (!result.success) {
      setError(t("databasesManager.openError"));
      setSwitchingId(null);
      return;
    }

    // إعادة تحميل لضمان نظافة كل الـ contexts
    window.location.reload();
  }

  // -------------------------------------------------------------------------
  // Ajouter: بعد النجاح، نُحدّث القائمة (لا نُبدّل تلقائيًا — المستخدم يقرّر)
  // -------------------------------------------------------------------------
  function handleDatabaseCreated(_newCompanyId: string) {
    setShowCreateModal(false);
    void reload();
  }

  // -------------------------------------------------------------------------
  // Supprimer: بعد النجاح، نُحدّث القائمة
  // -------------------------------------------------------------------------
  function handleDeleted() {
    setDeleteTarget(null);
    void reload();
  }

  const count = databases.length;
  const canAddMore = isOwner && count < maxDatabases;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={16} />
            {t("databasesManager.backToApp")}
          </button>
          <div className="flex-1" />
          {isDeveloper && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              👑 {t("databasesManager.developerBadge")}
            </span>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Title */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md">
              <Database size={22} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-800">
                {t("databasesManager.title")}
              </h1>
              <p className="text-sm text-slate-500">
                {t("databasesManager.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Compteur */}
        {!isLoading && !error && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
            <span className="text-sm text-slate-600">
              {t("databasesManager.countLabel", {
                current: count,
                max: maxDatabases,
              })}
            </span>
            {count >= maxDatabases && (
              <span className="text-xs font-semibold text-amber-600">
                {t("databasesManager.limitReachedHint")}
              </span>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="mr-2 animate-spin" size={20} />
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* بطاقات القواعد */}
            {databases.map((db) => {
              const isCurrent = db.company_id === activeCompanyId;
              const isSwitching = switchingId === db.company_id;
              return (
                <div
                  key={db.database_id}
                  className={`relative overflow-hidden rounded-xl border-2 bg-white p-4 transition-all ${
                    isCurrent
                      ? "border-indigo-500 shadow-md ring-2 ring-indigo-100"
                      : "border-slate-200 hover:border-indigo-300 hover:shadow-sm"
                  }`}
                >
                  {/* شارة ACTUELLE */}
                  {isCurrent && (
                    <span className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      <CheckCircle2 size={10} />
                      {t("databasesManager.currentBadge")}
                    </span>
                  )}

                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Database size={18} />
                  </div>

                  <div className="mb-0.5 truncate text-sm font-bold text-slate-800">
                    {db.company_name}
                  </div>
                  <div className="mb-3 truncate font-mono text-xs text-slate-400" dir="ltr">
                    {db.database_name}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleOpen(db)}
                      disabled={isCurrent || isSwitching || !db.is_owner}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isSwitching ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          {t("databasesManager.opening")}
                        </>
                      ) : isCurrent ? (
                        t("databasesManager.activeLabel")
                      ) : (
                        <>
                          <Settings size={12} />
                          {t("databasesManager.openButton")}
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setDeleteTarget(db)}
                      disabled={!db.is_owner}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title={t("databasesManager.deleteButton")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* بطاقة الإضافة */}
            {canAddMore && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-4 text-center text-indigo-600 transition-all hover:border-indigo-500 hover:bg-indigo-50"
              >
                <Plus size={26} className="mb-2" />
                <span className="text-sm font-bold">
                  {t("databasesManager.addButton")}
                </span>
                <span className="mt-0.5 text-[11px] text-indigo-400">
                  {count} / {maxDatabases}
                </span>
              </button>
            )}

            {/* حالة الحد الأقصى */}
            {isOwner && !canAddMore && (
              <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/40 p-4 text-center text-amber-600">
                <AlertTriangle size={22} className="mb-2 opacity-60" />
                <span className="text-xs font-bold">
                  {t("databasesManager.limitReached", {
                    current: count,
                    max: maxDatabases,
                  })}
                </span>
                <span className="mt-0.5 text-[10px] text-amber-500">
                  {t("databasesManager.limitReachedHint")}
                </span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: إنشاء قاعدة جديدة */}
      {showCreateModal && (
        <CreateDatabaseModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleDatabaseCreated}
          maxDatabases={maxDatabases}
          currentCount={count}
        />
      )}

      {/* Modal: حذف قاعدة */}
      {deleteTarget && (
        <DeleteDatabaseModal
          databaseId={deleteTarget.database_id}
          databaseName={deleteTarget.database_name}
          companyName={deleteTarget.company_name}
          isCurrent={deleteTarget.company_id === activeCompanyId}
          totalCount={count}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}