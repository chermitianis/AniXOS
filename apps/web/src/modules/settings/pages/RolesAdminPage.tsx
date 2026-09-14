import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { PERMISSION_MODULES, PERMISSION_ACTIONS, type PermissionAction } from "../permissionModules";
import type { Role } from "../../../shared/types/database";

type PermissionsMap = Record<string, PermissionAction[]>;

function togglePermission(perms: PermissionsMap, moduleKey: string, action: PermissionAction): PermissionsMap {
  const current = perms[moduleKey] ?? [];
  const updated = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
  return { ...perms, [moduleKey]: updated };
}

export function RolesAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [staffCountByRole, setStaffCountByRole] = useState<Record<string, number>>({});
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadRoles() {
    if (!staffUser) return;
    const { data, error: rolesError } = await supabase.from("roles").select("*").eq("company_id", staffUser.company_id).order("created_at");
    if (rolesError) { setError(rolesError.message); return; }
    setRoles((data as Role[]) ?? []);

    const { data: staffRows, error: staffError } = await supabase.from("staff_users").select("role_id").eq("company_id", staffUser.company_id);
    if (staffError) { setError(staffError.message); return; }
    const counts: Record<string, number> = {};
    for (const row of (staffRows ?? []) as { role_id: string }[]) {
      counts[row.role_id] = (counts[row.role_id] ?? 0) + 1;
    }
    setStaffCountByRole(counts);
  }

  useEffect(() => {
    void loadRoles();
  }, [staffUser]);

  function openCreate() {
    setIsCreating(true);
    setEditingRole(null);
    setName("");
    setPermissions({});
    setError(null);
  }

  function openEdit(role: Role) {
    setIsCreating(false);
    setEditingRole(role);
    setName(role.name);
    setPermissions(role.permissions as PermissionsMap);
    setError(null);
  }

  function closeForm() {
    setIsCreating(false);
    setEditingRole(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    try {
      if (isCreating) {
        const code = name.trim().toLowerCase().replace(/\s+/g, "_") + "_" + Date.now().toString(36);
        const { error: insertError } = await supabase.from("roles").insert({
          company_id: staffUser.company_id,
          code,
          name,
          is_system: false,
          permissions,
        });
        if (insertError) {
          setError(insertError.message);
          return;
        }
      } else if (editingRole) {
        const { error: updateError } = await supabase
          .from("roles")
          .update({ name, permissions })
          .eq("id", editingRole.id);
        if (updateError) {
          setError(updateError.message);
          return;
        }
        const { data: updatedRows } = await supabase.from("roles").select("id").eq("id", editingRole.id);
        if (!updatedRows || updatedRows.length === 0) {
          setError(t("setup.roleSaveFailed"));
          return;
        }
      }

      closeForm();
      await loadRoles();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(role: Role) {
    if (role.is_system) {
      setError(t("setup.cannotDeleteSystemRole"));
      return;
    }
    if ((staffCountByRole[role.id] ?? 0) > 0) {
      setError(t("setup.cannotDeleteRole"));
      return;
    }
    const { error: deleteError } = await supabase.from("roles").delete().eq("id", role.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadRoles();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t("setup.rolesTitle")} ({roles.length})</h2>
          <button onClick={openCreate} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            {t("setup.newRole")}
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          {t("setup.rolesFreedomNote")}
        </p>
        <ul className="flex flex-col gap-2">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div>
                <span className="font-semibold text-slate-700">{role.name}</span>
                <span className="mr-2 text-xs text-slate-400">({staffCountByRole[role.id] ?? 0} {t("setup.staffWord")})</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(role)} className="text-xs font-semibold text-blue-600">
                  {t("common.edit")}
                </button>
                <button onClick={() => handleDelete(role)} className="text-xs font-semibold text-red-500">
                  {t("common.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {(isCreating || editingRole) && (
        <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-800">{isCreating ? t("setup.newRole") : t("setup.editRoleTitle")}</h2>

          <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.roleName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />

          <p className="mb-2 text-sm font-semibold text-slate-600">{t("setup.permissionsMatrix")}</p>
          <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="p-2 text-right">{t("setup.module")}</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action} className="p-2 text-center">
                      {action}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MODULES.map((mod) => (
                  <tr key={mod.key} className="border-t border-slate-100">
                    <td className="p-2 font-semibold text-slate-600">{mod.label}</td>
                    {PERMISSION_ACTIONS.map((action) => (
                      <td key={action} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={(permissions[mod.key] ?? []).includes(action)}
                          onChange={() => setPermissions((prev) => togglePermission(prev, mod.key, action))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className="flex-1 rounded-lg py-2 text-sm text-slate-500">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isSaving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white disabled:opacity-50">
              {isSaving ? t("setup.saving") : t("common.save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
