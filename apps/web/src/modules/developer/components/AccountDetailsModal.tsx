import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Mail, Phone, MapPin, Database, Calendar, Activity,
  ShieldAlert, ShieldCheck, Clock, Trash2,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface AccountDetailsModalProps {
  accountId: string;
  onClose: () => void;
  onChanged?: () => void;
}

interface AccountFull {
  id: string;
  email: string;
  owner_full_name: string;
  phone: string | null;
  address: string | null;
  subscription_status: string;
  plan: string;
  is_developer: boolean;
  trial_ends_at: string;
  current_period_end: string | null;
  max_databases: number;
  suspended_by_admin: boolean;
  admin_notes: string | null;
  created_at: string;
}

interface DatabaseRow {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

interface EventRow {
  id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  performed_by: string | null;
  created_at: string;
}

export function AccountDetailsModal({ accountId, onClose, onChanged }: AccountDetailsModalProps) {
  const { t } = useTranslation();
  const [account, setAccount] = useState<AccountFull | null>(null);
  const [databases, setDatabases] = useState<DatabaseRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Delete states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);

    const [accountRes, dbsRes, eventsRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("id", accountId).maybeSingle(),
      supabase.from("databases").select("*").eq("account_id", accountId).order("created_at"),
      supabase
        .from("account_events")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setAccount((accountRes.data as AccountFull | null) ?? null);
    setDatabases((dbsRes.data as DatabaseRow[] | null) ?? []);
    setEvents((eventsRes.data as EventRow[] | null) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    setIsUpdating(true);
    setUpdateError(null);
    setUpdateMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke("dev-update-account", {
        body: { action, account_id: accountId, payload },
      });

      if (error || !data?.success) {
        let msg = data?.message ?? "Erreur";
        if (error && typeof error === "object" && "context" in error) {
          try {
            const ctx = (error as { context: Response }).context;
            const body = await ctx.json();
            msg = body?.message ?? msg;
          } catch {
            /* ignore */
          }
        }
        setUpdateError(msg);
        return;
      }

      setUpdateMsg(t("developer.actions.success"));
      await loadData();
      onChanged?.();
      setTimeout(() => setUpdateMsg(null), 3000);
    } catch (err) {
      console.error("[AccountDetailsModal]", err);
      setUpdateError(t("developer.actions.error"));
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete() {
    if (!account) return;

    if (deleteConfirmEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
      setDeleteError(t("developer.actions.deleteEmailMismatch"));
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const { data, error } = await supabase.functions.invoke("dev-delete-account", {
        body: {
          account_id: accountId,
          confirm_email: deleteConfirmEmail.trim(),
        },
      });

      if (error || !data?.success) {
        let msg = data?.message ?? "Erreur";
        if (error && typeof error === "object" && "context" in error) {
          try {
            const ctx = (error as { context: Response }).context;
            const body = await ctx.json();
            msg = body?.message ?? msg;
          } catch {
            /* ignore */
          }
        }
        setDeleteError(msg);
        return;
      }

      // نجح الحذف
      onChanged?.();
      onClose();
    } catch (err) {
      console.error("[AccountDetailsModal:delete]", err);
      setDeleteError(t("developer.actions.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }

  const deleteEmailMatches =
    account !== null &&
    deleteConfirmEmail.trim().toLowerCase() === account.email.toLowerCase();

  return (
    <>
      {/* ====================== Modal principal ====================== */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-800">
                {t("developer.accountDetails.title")}
              </h2>
              {account && (
                <p className="text-xs text-slate-400" dir="ltr">
                  {account.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>
            ) : !account ? (
              <div className="py-12 text-center text-sm text-slate-400">
                {t("developer.accountDetails.notFound")}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Infos */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("developer.accountDetails.sectionInfo")}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <InfoRow icon={Mail} label={t("auth.email")} value={account.email} />
                    <InfoRow icon={Phone} label={t("createAccount.phone")} value={account.phone ?? "—"} />
                    <InfoRow icon={MapPin} label={t("createAccount.address")} value={account.address ?? "—"} />
                    <InfoRow
                      icon={Calendar}
                      label={t("developer.accountDetails.createdAt")}
                      value={new Date(account.created_at).toLocaleString("fr-FR")}
                    />
                    <InfoRow
                      icon={Activity}
                      label={t("developer.accountDetails.plan")}
                      value={
                        account.plan === "trial"
                          ? t("subscription.planTrial")
                          : account.plan === "standard"
                            ? t("subscription.planStandard")
                            : t("subscription.planPremium")
                      }
                    />
                    <InfoRow
                      icon={Activity}
                      label={t("developer.accountDetails.status")}
                      value={t(`developer.accounts.status_${account.subscription_status}`)}
                    />
                  </div>

                  {account.is_developer && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2 py-1 text-[10px] font-extrabold text-amber-400">
                      DEVELOPER ACCOUNT
                    </div>
                  )}
                </div>

                {/* Bases de données */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Database size={12} />
                    {t("developer.accountDetails.sectionDatabases")} ({databases.length} / {account.max_databases})
                  </h3>
                  {databases.length === 0 ? (
                    <p className="text-sm text-slate-400">{t("developer.accountDetails.noDatabases")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {databases.map((db) => (
                        <li
                          key={db.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        >
                          <span className="font-mono text-slate-700" dir="ltr">{db.name}</span>
                          <span className="text-xs text-slate-400" dir="ltr">
                            {new Date(db.created_at).toLocaleDateString("fr-FR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Événements */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("developer.accountDetails.sectionEvents")}
                  </h3>
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-400">{t("developer.accountDetails.noEvents")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {events.map((ev) => (
                        <li
                          key={ev.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                              {ev.event_type}
                            </span>
                            <span className="text-xs text-slate-500">
                              {ev.performed_by ?? "system"}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400" dir="ltr">
                            {new Date(ev.created_at).toLocaleString("fr-FR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Actions de gestion */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("developer.actions.title")}
                  </h3>

                  {updateMsg && (
                    <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {updateMsg}
                    </div>
                  )}
                  {updateError && (
                    <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                      {updateError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void runAction("extend_trial", { days: 30 })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Clock size={14} />
                      {t("developer.actions.extendTrial30")}
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void runAction("change_plan", { plan: "standard", status: "active" })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {t("developer.actions.setStandard")}
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void runAction("change_plan", { plan: "premium", status: "active" })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {t("developer.actions.setPremium")}
                    </button>

                    {account.suspended_by_admin || account.subscription_status === "suspended" ? (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => void runAction("unsuspend")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <ShieldCheck size={14} />
                        {t("developer.actions.unsuspend")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => {
                          if (window.confirm(t("developer.actions.confirmSuspend"))) {
                            void runAction("suspend");
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <ShieldAlert size={14} />
                        {t("developer.actions.suspend")}
                      </button>
                    )}

                    {/* زر الحذف — فقط للحسابات غير المطوّر */}
                    {!account.is_developer && (
                      <button
                        type="button"
                        disabled={isUpdating || isDeleting}
                        onClick={() => {
                          setShowDeleteConfirm(true);
                          setDeleteConfirmEmail("");
                          setDeleteError(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {t("developer.actions.deleteAccount")}
                      </button>
                    )}
                  </div>

                  {isUpdating && (
                    <p className="mt-3 text-xs text-slate-400">{t("common.loading")}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>

      {/* ====================== Modal de confirmation de suppression ====================== */}
      {showDeleteConfirm && account && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-red-900/70 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-extrabold text-red-700">
                {t("developer.actions.deleteConfirmTitle")}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {t("developer.actions.deleteConfirmBody")}
              </p>
            </div>

            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-bold">{t("developer.actions.deleteWarningTitle")}</p>
              <ul className="mt-1 list-disc ps-5">
                <li>{t("developer.actions.deleteWarning1")}</li>
                <li>{t("developer.actions.deleteWarning2")}</li>
                <li>{t("developer.actions.deleteWarning3")}</li>
              </ul>
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-700">
              {t("developer.actions.deleteConfirmLabel")}
            </label>
            <input
              type="text"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={account.email}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              dir="ltr"
              autoFocus
            />

            {deleteError && (
              <div className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting || !deleteEmailMatches}
                className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {isDeleting ? t("common.loading") : t("developer.actions.deleteConfirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Helper InfoRow ---------- */
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <Icon size={12} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="truncate text-sm text-slate-700" dir="auto">{value}</p>
      </div>
    </div>
  );
}