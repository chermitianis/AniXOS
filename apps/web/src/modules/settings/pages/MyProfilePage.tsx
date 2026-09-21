import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  User, Mail, ShieldCheck, ShieldOff, CreditCard, Database as DatabaseIcon,
  ChevronRight, Lock, Unlock, Building2, BadgeCheck, CalendarDays,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";

interface MyProfilePageProps {
  onNavigateToSubscription?: () => void;
  onNavigateToDatabasesManager?: () => void;
}

// Préfixe localStorage pour le cadenas optionnel du Owner
const OWNER_LOCK_KEY_PREFIX = "anixos_owner_settings_locked:";

function readOwnerLock(staffId: string): boolean {
  try {
    return localStorage.getItem(OWNER_LOCK_KEY_PREFIX + staffId) === "1";
  } catch {
    return false;
  }
}
function writeOwnerLock(staffId: string, enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(OWNER_LOCK_KEY_PREFIX + staffId, "1");
    } else {
      localStorage.removeItem(OWNER_LOCK_KEY_PREFIX + staffId);
    }
  } catch {
    /* ignore */
  }
}

export function MyProfilePage({
  onNavigateToSubscription,
  onNavigateToDatabasesManager,
}: MyProfilePageProps) {
  const { t } = useTranslation();
  const { staffUser, role } = useStaffAuth();

  const isOwner = staffUser?.is_owner === true;

  const [isLocked, setIsLocked] = useState<boolean>(() =>
    staffUser ? readOwnerLock(staffUser.id) : false,
  );

  const initial = useMemo(() => {
    const name = staffUser?.full_name?.trim() ?? "";
    return name.length > 0 ? name.charAt(0).toUpperCase() : "?";
  }, [staffUser?.full_name]);

  function handleToggleLock() {
    if (!staffUser || !isOwner) return;
    const next = !isLocked;
    writeOwnerLock(staffUser.id, next);
    setIsLocked(next);
  }

  return (
    <div className="space-y-5">
      {/* En-tête profil */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-2xl font-extrabold text-white shadow-sm">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-extrabold text-slate-800">
              {staffUser?.full_name ?? "—"}
            </h1>
            {isOwner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                <BadgeCheck size={10} />
                {t("setup.ownerBadge")}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{role?.name ?? "—"}</p>
          {staffUser?.email && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400" dir="ltr">
              <Mail size={11} />
              {staffUser.email}
            </div>
          )}
        </div>
      </div>

      {/* Informations personnelles */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
          <User size={15} className="text-indigo-600" />
          {t("myProfile.sectionInfo")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("setup.fullName")}
            </label>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
              {staffUser?.full_name ?? "—"}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("setup.email")}
            </label>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700" dir="ltr">
              {staffUser?.email ?? "—"}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("setup.role")}
            </label>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
              {role?.name ?? "—"}
            </div>
          </div>

          {staffUser?.company_id && (
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Building2 size={11} />
                {t("myProfile.companyLabel")}
              </label>
              <div className="truncate rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
                {t("myProfile.companyActive")}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-slate-400" />
          {t("myProfile.infoReadOnly")}
        </p>
      </div>

      {/* Langue */}
      <LanguageSwitcher variant="card" />

      {/* Actions compte */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-800">
          {t("myProfile.sectionAccount")}
        </h2>

        {/* Gérer mon abonnement */}
        {onNavigateToSubscription && isOwner && (
          <button
            onClick={onNavigateToSubscription}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-start transition-colors hover:bg-slate-50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <CreditCard size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700">
                {t("subscription.manageSubscription")}
              </p>
              <p className="text-[11px] text-slate-400">
                {t("myProfile.subscriptionHint")}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        )}

        {/* Gérer mes bases de données */}
        {onNavigateToDatabasesManager && isOwner && (
          <button
            onClick={onNavigateToDatabasesManager}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-start transition-colors hover:bg-slate-50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <DatabaseIcon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700">
                {t("databasesManager.navLabel")}
              </p>
              <p className="text-[11px] text-slate-400">
                {t("myProfile.databasesHint")}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        )}

        {/* Cadenas optionnel — Owner uniquement */}
        {isOwner && (
          <div className="flex items-center gap-3 px-5 py-3.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isLocked ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
              }`}
            >
              {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700">
                {t("setup.lockSettingsTitle")}
              </p>
              <p className="text-[11px] text-slate-400">
                {isLocked ? t("setup.lockEnabled") : t("setup.lockSettingsHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleLock}
              role="switch"
              aria-checked={isLocked}
              aria-label={t("setup.lockSettingsTitle")}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                isLocked ? "bg-amber-500" : "bg-slate-300"
              }`}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200"
                style={{
                  transform: isLocked ? "translateX(22px)" : "translateX(2px)",
                }}
              />
            </button>
          </div>
        )}

        {/* Message pour non-owner */}
        {!isOwner && (
          <div className="flex items-start gap-2 px-5 py-3.5 text-[11px] text-slate-500">
            <CalendarDays size={12} className="mt-0.5 shrink-0 text-slate-400" />
            {t("myProfile.ownerOnlyActions")}
          </div>
        )}
      </div>

      {/* Note de sécurité */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
        <ShieldOff size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <span>{t("myProfile.securityNote")}</span>
      </div>
    </div>
  );
}