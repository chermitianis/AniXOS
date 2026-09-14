interface TaskCardProps {
  label: string;
  color: string;
  isActive?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}

/** بطاقة لمسية كبيرة (مهمة إنتاجية أو سبب توقف) — نفس المكوّن لكليهما */
export function TaskCard({ label, color, isActive, onClick, onDoubleClick }: TaskCardProps) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="flex h-24 items-center justify-center rounded-2xl p-3 text-center text-base font-bold text-white shadow-md transition-all active:scale-95"
      style={{
        backgroundColor: color,
        boxShadow: isActive ? `0 8px 20px -4px ${color}99` : `0 4px 10px -2px ${color}55`,
        outline: isActive ? "3px solid rgba(255,255,255,0.95)" : "none",
        outlineOffset: isActive ? "-4px" : "0",
        transform: isActive ? "scale(1.03)" : "scale(1)",
      }}
    >
      {label}
    </button>
  );
}
