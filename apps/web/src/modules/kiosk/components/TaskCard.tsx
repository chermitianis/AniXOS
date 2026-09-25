import { Clock } from "lucide-react";

interface TaskCardProps {
  label: string;
  color: string;
  isActive?: boolean;
  /** Estimation en minutes pour cette opération (optionnel). */
  estimateMinutes?: number | null;
  onClick: () => void;
  onDoubleClick?: () => void;
}

/** Formate X minutes en "Xmin" ou "Xh YY" — texte compact. */
function formatEstimate(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}

/** بطاقة لمسية كبيرة (مهمة إنتاجية أو سبب توقف) — نفس المكوّن لكليهما. */
export function TaskCard({
  label,
  color,
  isActive,
  estimateMinutes,
  onClick,
  onDoubleClick,
}: TaskCardProps) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="relative flex h-24 flex-col items-center justify-center rounded-2xl p-3 text-center text-base font-bold text-white shadow-md transition-all active:scale-95"
      style={{
        backgroundColor: color,
        boxShadow: isActive ? `0 8px 20px -4px ${color}99` : `0 4px 10px -2px ${color}55`,
        outline: isActive ? "3px solid rgba(255,255,255,0.95)" : "none",
        outlineOffset: isActive ? "-4px" : "0",
        transform: isActive ? "scale(1.03)" : "scale(1)",
      }}
    >
      <span className="line-clamp-2">{label}</span>

      {/* Badge d'estimation en bas à droite */}
      {estimateMinutes != null && estimateMinutes > 0 && (
        <span className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-bold text-white">
          <Clock size={9} />
          {formatEstimate(estimateMinutes)}
        </span>
      )}
    </button>
  );
}