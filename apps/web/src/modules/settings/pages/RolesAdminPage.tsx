import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Shield, Pencil, Trash2, Eye, Loader2 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { hasPermission } from "../../../auth/permissions";
import {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  type PermissionAction,
} from "../permissionModules";
import type { Role } from "../../../shared/types/database";

type PermissionsMap = Record<string, PermissionAction[]>;

function togglePermission(
  perms: PermissionsMap,
  moduleKey: string,
  action: PermissionAction,
): PermissionsMap {
  const current = perms[moduleKey] ?? [];
  const updated = current.includes(action)
    ? current.filter((a) => a !== action)
    : [...current, action];
  return { ...perms, [moduleKey]: updated };
}

export function RolesAdminPage() {
  const { t } = useTranslation();
  const { staffUser, role } = useStaffAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [staffCountByRole, setStaffCountByRole] = useState<Record<string, number>>({});
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Le Owner peut tout faire. Un staff doit avoir "roles:edit" pour modifier.
  const canEdit =
    staffUser?.is_owner === true || hasPermission(role, "roles", "edit");

  async function loadRoles() {
    if (!staffUser) return;
    const { data, error: rolesError } = await supabase
      .from("roles")
      .select("*")
      .eq("company_id", staffUser.company_id)
      .order("created_at");
    if (rolesError) {
      setError(rolesError.message);
      return;
    }
    setRoles((data as Role[]) ?? []);

    const { data: staffRows, error: staffError } = await supabase
      .from("staff_users")
      .select("role_id")
      .eq("company_id", staffUser.company_id);
    if (staffError) {
      setError(staffError.message);
      return;
    }
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

  function openEdit(roleToEdit: Role) {
    setIsCreating(false);
    setEditingRole(roleToEdit);
    setName(roleToEdit.name);
    setPermissions(roleToEdit.permissions as PermissionsMap);
    setError(null);
  }

  function closeForm() {
    setIsCreating(false);
    setEditingRole(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !canEdit) return;
    setError(null);
    setIsSaving(true);

    try {
      if (isCreating) {
        const code =
          name.trim().toLowerCase().replace(/\s+/g, "_") +
          "_" +
          Date.now().toString(36);
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
      }

      closeForm();
      await loadRoles();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(roleToDelete: Role) {
    if (!canEdit) return;
    if (roleToDelete.is_system) {
      setError(t("setup.cannotDeleteSystemRole"));
      return;
    }
    if ((staffCountByRole[roleToDelete.id] ?? 0) > 0) {
      setError(t("setup.cannotDeleteRole"));
      return;
    }
    if (!window.confirm(t("setup.confirmDeleteRole"))) return;

    const { error: deleteError } = await supabase
      .from("roles")
      .delete()
      .eq("id", roleToDelete.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadRoles();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Liste des rôles */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">
              {t("setup.rolesTitle")} ({roles.length})
            </h2>
          </div>
          {canEdit && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              <Plus size={14} />
              {t("setup.newRole")}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-400">{t("setup.rolesFreedomNote")}</p>

        {!canEdit && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <Eye size={13} className="mt-0.5 shrink-0" />
            {t("setup.readOnlyNotice")}
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {roles.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-slate-700">{r.name}</span>
                  {r.is_system && (
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      {t("setup.systemBadge")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  ({staffCountByRole[r.id] ?? 0} {t("setup.staffWord")})
                </span>
              </div>

              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50"
                    title={t("common.edit")}
                  >
                    <Pencil size={13} />
                  </button>
                  {!r.is_system && (
                    <button
                      onClick={() => void handleDelete(r)}
                      className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50"
                      title={t("common.delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Formulaire de création / édition */}
      {(isCreating || editingRole) && canEdit && (
        <form
          onSubmit={handleSubmit}
          className="h-fit rounded-xl border border-slate-200 bg-white p-5"
        >
          <h2 className="mb-4 text-lg font-bold text-slate-800">
            {isCreating ? t("setup.newRole") : t("setup.editRoleTitle")}
          </h2>

          <label className="mb-1 block text-sm font-semibold text-slate-600">
            {t("setup.roleName")}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            required
          />

          <p className="mb-2 text-sm font-semibold text-slate-600">
            {t("setup.permissionsMatrix")}
          </p>
          <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="p-2 text-start">{t("setup.module")}</th>
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
                          onChange={() =>
                            setPermissions((prev) =>
                              togglePermission(prev, mod.key, action),
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="flex-1 rounded-lg py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("setup.saving")}
                </>
              ) : (
                t("common.save")
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}