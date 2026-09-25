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

const INDENT_PER_LEVEL = 12;

export function NavItem({
  node,
  depth,
  activeKey,
  expandedKeys,
  onSelect,
  onToggleExpand,
}: NavItemProps) {
  const { t } = useTranslation();
  const hasChildren = !!node.children && node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);
  const isActive = activeKey === node.key;
  const label = t(node.labelKey, { defaultValue: node.label });
  const Icon = node.icon;

  function handleClick() {
    if (hasChildren) {
      onToggleExpand(node.key);
    } else {
      onSelect(node.key);
    }
  }

  const indent = depth * INDENT_PER_LEVEL + 12;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={`group flex w-full items-center gap-2 rounded-lg py-1.5 pe-2 text-start text-sm font-medium transition-colors ${
          isActive
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
        style={{ paddingInlineStart: indent }}
      >
        {Icon && (
          <Icon
            size={16}
            className={`shrink-0 ${
              isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-500"
            }`}
          />
        )}
        <span className="flex-1 truncate">{label}</span>
        {hasChildren && (
          <ChevronRight
            size={14}
            className={`shrink-0 text-slate-400 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
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