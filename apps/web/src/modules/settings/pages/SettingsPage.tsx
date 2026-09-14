import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsGate } from "../components/SettingsGate";
import { DeviceSettingsPage } from "./DeviceSettingsPage";
import { RolesAdminPage } from "./RolesAdminPage";
import { StaffAdminPage } from "./StaffAdminPage";

type SettingsTab = "device" | "staff" | "roles";

export function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("staff");

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "staff", label: t("nav.staff") },
    { key: "roles", label: t("nav.roles") },
    { key: "device", label: t("nav.device") },
  ];

  return (
    <SettingsGate>
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "staff" && <StaffAdminPage />}
      {activeTab === "roles" && <RolesAdminPage />}
      {activeTab === "device" && <DeviceSettingsPage />}
    </SettingsGate>
  );
}
