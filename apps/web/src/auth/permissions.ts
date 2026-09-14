// ============================================================================
// دوال مساعدة للتحقق من الصلاحيات، بناءً على permissions (JSONB) المخزّنة
// في جدول roles. الشكل: { "module_name": ["view","create","edit","delete"] }
// دور "owner" يملك مفتاح "all" الذي يمنحه كل الصلاحيات على كل الوحدات.
// ============================================================================

import type { Role } from "../shared/types/database";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve";

export function hasPermission(
  role: Role | null,
  module: string,
  action: PermissionAction
): boolean {
  if (!role) return false;

  // نحوّل permissions إلى كائن آمن حتى لو كان null أو غير كائن
  const perms = (role.permissions ?? {}) as Record<string, string[] | undefined>;

  // "all" تمنح صلاحية كاملة على كل الوحدات (دور المالك تحديداً)
  const allPermissions = perms["all"];
  if (allPermissions?.includes(action)) return true;

  const modulePermissions = perms[module];
  return modulePermissions?.includes(action) ?? false;
}

export function canViewModule(role: Role | null, module: string): boolean {
  return hasPermission(role, module, "view");
}