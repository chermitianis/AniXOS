import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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

  async function loadData() {
    const { data: staff } = await supabase.from("staff_users").select("*").order("created_at");
    setStaffList((staff as StaffUser[]) ?? []);

    const { data: roleRows } = await supabase.from("roles").select("*").order("name");
    setRoles((roleRows as Role[]) ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const selectedRole = roles.find((r) => r.id === roleId);
    if (!selectedRole) {
      setError("Veuillez sélectionner un rôle valide.");
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
          role_id: selectedRole.id, // إرسال الـ ID كبديل ضامن
        },
      });

      if (fnError) {
        let errorMsg = fnError.message;
        try {
          const errCtx = await fnError.context?.json();
          if (errCtx?.message || errCtx?.error) {
            errorMsg = errCtx.message || errCtx.error;
          }
        } catch (_) {}
        setError(errorMsg || "Erreur lors de l'invitation");
        return;
      }

      if (!data?.success) {
        setError(data?.message ?? "Erreur lors de l'invitation");
        return;
      }

      // النجاح
      setFullName("");
      setEmail("");
      setTempPassword("");
      setRoleId("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Erreur réseau");
    } finally {
      setIsSaving(false);
    }
  }

  async function changeRole(staff: StaffUser, newRoleId: string) {
    await supabase.from("staff_users").update({ role_id: newRoleId }).eq("id", staff.id);
    await loadData();
  }

  const isOwner = currentStaff?.is_owner ?? false;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {isOwner && (
        <form onSubmit={handleInvite} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-slate-800">{t("setup.inviteStaff")}</h2>
          <p className="mb-4 text-sm text-slate-400"></p>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.fullName")}</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            dir="ltr"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.tempPassword")}</label>
          <input
            type="password"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            minLength={6}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.role")}</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          >
            <option value="">{t("setup.selectRole")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSaving ? t("setup.invitingBtn") : t("setup.inviteButton")}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {t("setup.staffList")} ({staffList.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {staffList.map((staff) => (
            <li key={staff.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  {staff.full_name} {staff.is_owner && "👑"}
                </span>
                <span className="text-xs text-slate-400" dir="ltr">
                  {staff.email}
                </span>
              </div>
              {staff.is_owner ? (
                <span className="text-xs text-slate-400">{t("setup.ownerUnchangeable")}</span>
              ) : (
                <select
                  value={staff.role_id}
                  onChange={(e) => changeRole(staff, e.target.value)}
                  disabled={!isOwner}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}