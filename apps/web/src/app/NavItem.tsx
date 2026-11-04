import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { NavNode } from "./navTree";

interface NavItemProps {
  node: NavNode;
  depth: number;
  activeKey: string | null;
  expandedKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggleExpand: (key: string) => void;
}

// زيادة المسافة البادئة لتكون أوضح للعناصر الفرعية
const INDENT_PER_LEVEL = 16;

export function NavItem({
  node,
  depth,
  activeKey,
  expandedKeys,
  onSelect,
  onToggleExpand,
}: NavItemProps) {
  const { t } = useTranslation();
  
  const hasMultipleChildren = !!node.children && node.children.length > 1;
  const singleChild = node.children && node.children.length === 1 ? node.children[0] : null;
  const targetNode = singleChild ? singleChild : node;

  const isExpanded = expandedKeys.has(node.key);
  const isActive = activeKey === targetNode.key;
  
  const label = t(targetNode.labelKey, { defaultValue: targetNode.label });
  const Icon = targetNode.icon || node.icon;

  function handleClick() {
    if (hasMultipleChildren) {
      onToggleExpand(node.key);
    } else {
      onSelect(targetNode.key);
    }
  }

  // حساب المسافة البادئة: المسافة الأساسية + (مستوى العمق * المسافة لكل مستوى)
  const paddingStart = depth * INDENT_PER_LEVEL + 12;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={`group flex w-full items-center gap-2 rounded-lg py-2 pe-2 text-start text-[13px] font-medium transition-colors duration-150 ${
          isActive ? "font-bold" : ""
        }`}
        style={{
          paddingInlineStart: paddingStart,
          backgroundColor: isActive ? "var(--sidebar-bg-active)" : "transparent",
          color: isActive ? "#ffffff" : "var(--sidebar-text)",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = "var(--sidebar-bg-hover)";
            e.currentTarget.style.color = "#ffffff";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--sidebar-text)";
          }
        }}
      >
        {Icon && (
          <Icon
            size={16}
            className="shrink-0 transition-colors"
            style={{
              color: isActive ? "#ffffff" : "var(--sidebar-text-secondary)",
            }}
          />
        )}
        <span className="flex-1 truncate">{label}</span>
        
        {hasMultipleChildren && (
          <ChevronRight
            size={14}
            className={`shrink-0 transition-transform duration-150 ${
              isExpanded ? "rotate-90" : ""
            }`}
            style={{
              color: isActive ? "#ffffff" : "var(--sidebar-text-secondary)",
            }}
          />
        )}
      </button>

      {hasMultipleChildren && isExpanded && (
        <div className="mt-0.5">
          {node.children!.map((child) => (
            <NavItem
              key={child.key}
              node={child}
              depth={depth + 1}
              activeKey={activeKey}
              expandedKeys={expandedKeys}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}