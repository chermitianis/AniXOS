import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  UserCircle2, KeyRound, LogOut, ChevronDown,
} from "lucide-react";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";

interface ProfileMenuProps {
  onOpenProfile: () => void;
}

export function ProfileMenu({ onOpenProfile }: ProfileMenuProps) {
  const { t } = useTranslation();
  const { staffUser, role, signOut } = useStaffAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initial = (staffUser?.full_name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white ps-0.5 pe-2 shadow-sm transition-colors hover:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-xs font-bold text-white">
            {initial}
          </span>
          <ChevronDown
            size={12}
            className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <div className="absolute end-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {/* En-tête */}
            <div className="border-b border-slate-100 px-3 py-2.5">
              <div className="truncate text-sm font-bold text-slate-800">
                {staffUser?.full_name ?? "—"}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">
                {role?.name ?? "—"}
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenProfile();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UserCircle2 size={16} className="text-slate-400" />
              {t("nav.myProfile")}
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                setShowChangePassword(true);
              }}
              className="flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-start text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <KeyRound size={16} className="text-slate-400" />
              {t("myProfile.changePasswordTitle")}
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                void signOut();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} />
              {t("common.logout")}
            </button>
          </div>
        )}
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}