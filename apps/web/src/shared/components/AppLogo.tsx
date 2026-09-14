/**
 * شعار AniXOS الموحّد — نفس المصدر البصري (أيقونة PWA في public/) يُستخدم
 * في الواجهة الإدارية وواجهة العامل معاً، بدل الشارة النصية "AX" اليدوية
 * التي كانت مكررة ومختلفة الشكل بين المكانين.
 *
 * المصدر: apps/web/public/icon-*.png (نفس الملفات المستخدمة لبناء أيقونات
 * PWA في dist/ عند البناء) — نستخدم هنا الدقة الأنسب لحجم كل سياق عرض
 * بدل تحميل icon-512.png الثقيل في كل مكان.
 */
const SIZE_CLASSES = {
  sm: "h-9 w-9 rounded-xl",
  md: "h-11 w-11 rounded-xl",
  lg: "h-16 w-16 rounded-2xl",
} as const;

const SIZE_SOURCES = {
  sm: "/icon-96.png",
  md: "/icon-96.png",
  lg: "/icon-192.png",
} as const;

interface AppLogoProps {
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function AppLogo({ size = "sm", className = "" }: AppLogoProps) {
  return (
    <img
      src={SIZE_SOURCES[size]}
      alt="AniXOS"
      className={`shrink-0 object-contain shadow-md shadow-indigo-200/70 ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}
