import { LucideIcon } from "lucide-react";
import { memo, ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  // tone class for the icon, e.g. "text-emerald-400" for a good empty ("all clear")
  iconClass?: string;
  children?: ReactNode;
  className?: string;
}

// ONE EMPTY-STATE SHAPE FOR EVERY DOCK PANEL: icon, a short title, an optional one-line hint
export default memo(function EmptyState({ icon: Icon, title, hint, iconClass = "text-slate-500", children, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex h-full min-h-[8rem] flex-col items-center justify-center gap-1.5 px-4 py-3 text-center ${className}`}>
      <Icon className={`h-6 w-6 ${iconClass}`} aria-hidden />
      <p className="text-xs font-semibold text-slate-200">{title}</p>
      {hint && <p className="max-w-xs text-caption text-slate-400">{hint}</p>}
      {children}
    </div>
  );
});
