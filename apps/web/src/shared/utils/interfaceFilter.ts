// ============================================================================
// interfaceFilter: منطق موحّد لفلترة أزرار Kiosk حسب interface_type للعامل.
//
// قواعد الفلترة:
//   - عامل 'both'        → يرى كل الأزرار (لا فلترة)
//   - عامل 'cnc'         → يرى أزرار 'cnc' + 'both'
//   - عامل 'classique'   → يرى أزرار 'classique' + 'both'
//   - عامل 'manual' (قديم) → يُعامَل كـ'classique' (توافقية مؤقتة)
//   - زر بقيمة 'manual'  → يُعامَل كـ'classique' (توافقية مؤقتة)
// ============================================================================

import type { InterfaceType } from "../types/database";

/** توحيد القيم القديمة: 'manual' → 'classique' */
function normalize(value: InterfaceType | string | null | undefined): InterfaceType {
  if (value === "manual") return "classique";
  if (value === "cnc" || value === "classique" || value === "both") return value;
  return "both"; // fallback آمن
}

/**
 * يفلتر عناصر لها حقل interface_type حسب الواجهة المطلوبة.
 * يُستخدم في useTaskTypes و useStopReasons (وفي أي مكان مستقبلي).
 */
export function filterByInterface<T extends { interface_type: InterfaceType | string }>(
  items: T[],
  workerInterface: InterfaceType | string | null | undefined
): T[] {
  const target = normalize(workerInterface);
  if (target === "both") return items;

  return items.filter((item) => {
    const itemType = normalize(item.interface_type);
    return itemType === target || itemType === "both";
  });
}