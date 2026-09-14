import { useTranslation } from "react-i18next";
/**
 * ملاحظة معمارية مهمة: واجهة الورشة (Kiosk) لا يمكن فتحها كـ"صفحة" داخل
 * لوحة الإدارة، لأنها تعتمد بنيوياً على جلسة جهاز دائمة ومستقلة (device
 * auth session) تُنشأ فقط عند تسجيل جهاز فعلي كـ"محطة عامل" — راجع
 * DeviceRoleSelectionPage و register-device Edge Function. فتحها من هنا
 * كان سيتطلب تبديل جلسة الموظف الإداري الحالية بجلسة جهاز، وهو سلوك غير
 * آمن وغير متوقَّع من صفحة عرض بسيطة.
 */
export function WorkshopInfoPage() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-2 text-lg font-bold text-slate-800">{t("setup.workshopInfoTitle")}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {t("setup.workshopInfoBody")}
      </p>

      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        <p className="mb-2 font-semibold">{t("setup.workshopStepsIntro")}</p>
        <ol className="list-inside list-decimal space-y-1">
          <li>{t("setup.workshopStep1")}</li>
          <li>{t("setup.workshopStep2")}</li>
          <li>{t("setup.workshopStep3")}</li>
          <li>{t("setup.workshopStep4")}</li>
        </ol>
      </div>
    </div>
  );
}
