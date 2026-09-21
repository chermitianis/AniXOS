import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus, Trash2, ShieldCheck, ShieldOff, Mail, Loader2 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type { StaffUser, Role } from "../../../shared/types/database";

export function StaffAdminPage() {
  const { t } = useTranslation();
  const { staffUser: currentStaff } = useStaffAuth();
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwner = currentStaff?.is_owner ?? false;

  async function loadData() {
    const { data: staff } = await supabase
      .from("staff_users")
      .select("*")
      .order("created_at");
    setStaffList((staff as StaffUser[]) ?? []);

    const { data: roleRows } = await supabase
      .from("roles")
      .select("*")
      .order("name");
    setRoles((roleRows as Role[]) ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  // ---------------------------------------------------------------------
  // Invitation
  // ---------------------------------------------------------------------
  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const selectedRole = roles.find((r) => r.id === roleId);
    if (!selectedRole) {
      setError(t("setup.selectRoleRequired"));
      return;
    }

    setIsSaving(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("staff-invite", {
        body: {
          invitee_email: email.trim(),
          invitee_full_name: fullName.trim(),
          temp_password: tempPassword,
          role_code: selectedRole.code || selectedRole.name,
          role_id: selectedRole.id,
        },
      });

      if (fnError) {
        let errorMsg = fnError.message;
        try {
          const errCtx = await fnError.context?.json();
          if (errCtx?.message || errCtx?.error) {
            errorMsg = errCtx.message || errCtx.error;
          }
        } catch {
          /* ignore */
        }
        setError(errorMsg || t("setup.inviteError"));
        return;
      }

      if (!data?.success) {
        setError(data?.message ?? t("setup.inviteError"));
        return;
      }

      setFullName("");
      setEmail("");
      setTempPassword("");
      setRoleId("");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("setup.inviteError"));
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Changement de rôle
  // ---------------------------------------------------------------------
  async function changeRole(staff: StaffUser, newRoleId: string) {
    setBusyId(staff.id);
    try {
      await supabase.from("staff_users").update({ role_id: newRoleId }).eq("id", staff.id);
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  // ---------------------------------------------------------------------
  // Toggle actif/inactif
  // ---------------------------------------------------------------------
  async function toggleActive(staff: StaffUser) {
    if (!isOwner || staff.is_owner) return;
    setBusyId(staff.id);
    try {
      await supabase
        .from("staff_users")
        .update({ is_active: !staff.is_active })
        .eq("id", staff.id);
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  // ---------------------------------------------------------------------
  // Suppression
  // ---------------------------------------------------------------------
  async function deleteStaff(staff: StaffUser) {
    if (!isOwner || staff.is_owner) return;
    if (!window.confirm(t("setup.confirmDeleteStaff"))) return;

    setBusyId(staff.id);
    try {
      const { error: delErr } = await supabase
        .from("staff_users")
        .delete()
        .eq("id", staff.id);
      if (delErr) {
        setError(delErr.message);
        return;
      }
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Formulaire d'invitation — Owner uniquement */}
      {isOwner && (
        <form onSubmit={handleInvite} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus size={18} className="text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">{t("setup.inviteStaff")}</h2>
          </div>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.fullName")}</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            dir="ltr"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.tempPassword")}</label>
          <input
            type="password"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            minLength={6}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.role")}</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            required
          >
            <option value="">{t("setup.selectRole")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? t("setup.invitingBtn") : t("setup.inviteButton")}
          </button>
        </form>
      )}

      {/* Liste des employés */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {t("setup.staffList")} ({staffList.length})
        </h2>

        {staffList.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
            {t("setup.noStaffYet")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {staffList.map((staff) => {
              const isBusy = busyId === staff.id;
              return (
                <li
                  key={staff.id}
                  className={`rounded-lg border p-3 text-sm transition-colors ${
                    staff.is_active
                      ? "border-slate-100 bg-slate-50"
                      : "border-amber-100 bg-amber-50/40"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-slate-700">
                          {staff.full_name}
                        </span>
                        {staff.is_owner && <span title="Owner">👑</span>}
                        {!staff.is_active && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            {t("common.inactive")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400" dir="ltr">
                        <Mail size={11} />
                        {staff.email}
                      </div>
                    </div>

                    {/* Actions — Owner uniquement, pas pour soi-même */}
                    {isOwner && !staff.is_owner && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void toggleActive(staff)}
                          disabled={isBusy}
                          className={`rounded p-1.5 transition-colors ${
                            staff.is_active
                              ? "text-amber-600 hover:bg-amber-100"
                              : "text-green-600 hover:bg-green-100"
                          } disabled:opacity-40`}
                          title={staff.is_active ? t("setup.deactivateStaff") : t("setup.activateStaff")}
                        >
                          {isBusy ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : staff.is_active ? (
                            <ShieldOff size={13} />
                          ) : (
                            <ShieldCheck size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteStaff(staff)}
                          disabled={isBusy}
                          className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40"
                          title={t("common.delete")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sélecteur de rôle */}
                  {staff.is_owner ? (
                    <span className="text-xs text-slate-400">{t("setup.ownerUnchangeable")}</span>
                  ) : (
                    <select
                      value={staff.role_id}
                      onChange={(e) => void changeRole(staff, e.target.value)}
                      disabled={!isOwner || isBusy}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}