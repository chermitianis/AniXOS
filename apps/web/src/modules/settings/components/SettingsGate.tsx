import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { hasPermission } from "../../../auth/permissions";

interface SettingsGateProps {
  children: ReactNode;
}

/**
 * Clés localStorage :
 *   - TRUSTED_DEVICE_KEY_PREFIX : appareil de confiance pour un staff donné
 *   - OWNER_LOCK_KEY_PREFIX     : le Owner a activé le cadenas sur SES settings
 */
const TRUSTED_DEVICE_KEY_PREFIX = "anixos_trusted_settings_device:";
const OWNER_LOCK_KEY_PREFIX = "anixos_owner_settings_locked:";

function isDeviceTrustedFor(staffUserId: string): boolean {
  try {
    return localStorage.getItem(TRUSTED_DEVICE_KEY_PREFIX + staffUserId) === "1";
  } catch {
    return false;
  }
}
function trustDeviceFor(staffUserId: string) {
  try {
    localStorage.setItem(TRUSTED_DEVICE_KEY_PREFIX + staffUserId, "1");
  } catch {
    /* localStorage indisponible */
  }
}
function forgetTrustedDevice(staffUserId: string) {
  try {
    localStorage.removeItem(TRUSTED_DEVICE_KEY_PREFIX + staffUserId);
  } catch {
    /* ignoré */
  }
}
function isOwnerLockEnabled(staffUserId: string): boolean {
  try {
    return localStorage.getItem(OWNER_LOCK_KEY_PREFIX + staffUserId) === "1";
  } catch {
    return false;
  }
}

/**
 * SettingsGate — protection à deux niveaux :
 *
 *   ┌──────────┬──────────────┬──────────────────────────────────────┐
 *   │ Rôle     │ Accès        │ Comportement                         │
 *   ├──────────┼──────────────┼──────────────────────────────────────┤
 *   │ Owner    │ Autorisé     │ Pas de mot de passe par défaut.      │
 *   │          │              │ Peut activer un cadenas optionnel.   │
 *   ├──────────┼──────────────┼──────────────────────────────────────┤
 *   │ Staff    │ Selon perm.  │ Mot de passe OBLIGATOIRE (step-up).  │
 *   │          │ + settings   │ Option "faire confiance à l'appareil"│
 *   ├──────────┼──────────────┼──────────────────────────────────────┤
 *   │ Autres   │ Refusé si    │ Écran d'accès refusé.                │
 *   │          │ settings:edit│                                      │
 *   │          │ absent       │                                      │
 *   └──────────┴──────────────┴──────────────────────────────────────┘
 */
export function SettingsGate({ children }: SettingsGateProps) {
  const { t } = useTranslation();
  const { staffUser, role } = useStaffAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockedViaTrust, setUnlockedViaTrust] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const isOwner = staffUser?.is_owner === true;
  const isAuthorized = isOwner || hasPermission(role, "settings", "edit");

  // Le Owner est déverrouillé d'office SAUF s'il a activé son cadenas optionnel.
  // Le Staff n'est jamais déverrouillé d'office (sauf appareil de confiance).
  useEffect(() => {
    if (!staffUser || !isAuthorized) return;

    if (isOwner) {
      if (!isOwnerLockEnabled(staffUser.id)) {
        setIsUnlocked(true);
        setUnlockedViaTrust(false);
      }
      return;
    }

    // Staff : vérifie l'appareil de confiance
    if (isDeviceTrustedFor(staffUser.id)) {
      setIsUnlocked(true);
      setUnlockedViaTrust(true);
    }
  }, [isAuthorized, isOwner, staffUser]);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsVerifying(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: staffUser.email,
        password,
      });

      if (verifyError) {
        setError(t("setup.wrongPasswordShort"));
        return;
      }

      // Le "trust device" n'est proposé qu'au Staff (le Owner décide via son cadenas)
      if (rememberDevice && !isOwner) {
        trustDeviceFor(staffUser.id);
      }
      setIsUnlocked(true);
      setUnlockedViaTrust(false);
    } finally {
      setIsVerifying(false);
    }
  }

  function handleForgetDevice() {
    if (!staffUser) return;
    forgetTrustedDevice(staffUser.id);
    setUnlockedViaTrust(false);
    setIsUnlocked(false);
  }

  // ---------------------------------------------------------------------
  // Accès refusé (ni Owner ni settings:edit)
  // ---------------------------------------------------------------------
  if (!isAuthorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-xl border border-red-100 bg-red-50 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 text-red-500" size={32} />
          <h2 className="mb-1 text-lg font-bold text-red-700">{t("setup.accessDeniedTitle")}</h2>
          <p className="text-sm text-red-500">{t("setup.accessDeniedBody")}</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Déverrouillé : affiche le contenu + badge "forget device" pour le staff
  // ---------------------------------------------------------------------
  if (isUnlocked) {
    return (
      <>
        {children}
        {unlockedViaTrust && (
          <button
            type="button"
            onClick={handleForgetDevice}
            className="fixed bottom-3 end-3 z-40 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-400 shadow-sm ring-1 ring-slate-200 hover:text-slate-600"
            title={t("setup.forgetDeviceHint")}
          >
            <ShieldCheck size={12} />
            {t("setup.forgetDevice")}
          </button>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------
  // Écran de saisie du mot de passe (Owner avec cadenas OU Staff)
  // ---------------------------------------------------------------------
  const title = isOwner ? t("setup.ownerLockedTitle") : t("setup.protectedArea");
  const subtitle = isOwner ? t("setup.ownerLockedSubtitle") : t("setup.reenterPassword");

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form
        onSubmit={handleVerify}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-3 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
            {isOwner ? (
              <ShieldOff className="text-indigo-600" size={22} />
            ) : (
              <Lock className="text-indigo-600" size={22} />
            )}
          </div>
        </div>
        <h2 className="mb-1 text-center text-lg font-bold text-slate-800">{title}</h2>
        <p className="mb-4 text-center text-sm text-slate-400">{subtitle}</p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.password")}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoFocus
          required
        />

        {/* Option "se souvenir de cet appareil" — uniquement pour le Staff */}
        {!isOwner && (
          <label className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
            />
            {t("setup.trustThisDevice")}
          </label>
        )}

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={isVerifying}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {isVerifying ? t("setup.verifyingBtn") : t("common.confirm")}
        </button>
      </form>
    </div>
  );
}