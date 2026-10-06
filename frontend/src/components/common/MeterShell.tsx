import { LucideIcon } from "lucide-react";
import { memo, ReactNode } from "react";
import { useChangeSeq } from "../../hooks/useChangeSeq";
import { KpiId } from "../../utils/kpiBands";
import KpiChips from "./KpiChips";

interface MeterShellProps {
  kpi: KpiId;
  icon: LucideIcon;
  // tone text class for the icon (also what the band-crossing flash glows in)
  iconClass: string;
  label: string;
  // current band; a change plays the one-shot flash
  band: number;
  title?: string;
  // spotlight target for the guided tutorial
  tour?: string;
  className?: string;
  children: ReactNode;
}

// SHARED CHROME FOR EVERY TOPBAR METER: icon + label row, the value row, the chips that fly off it
// and a one-shot flash whenever the value crosses into another band
export default memo(function MeterShell({ kpi, icon: Icon, iconClass, label, band, title, tour, className = "", children }: MeterShellProps) {
  const flashSeq = useChangeSeq(band);

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} data-kpi={kpi} data-tour={tour} title={title}>
      <div className="flex h-4 items-center gap-1.5">
        <span
          key={flashSeq}
          className={`inline-flex rounded-full transition-colors duration-slow ${iconClass} ${flashSeq > 0 ? "animate-kpi-band-flash" : ""}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="hidden hd:inline whitespace-nowrap font-heading text-xs font-semibold uppercase leading-none tracking-wider text-slate-400">
          {label}
        </span>
      </div>
      <div className="relative flex items-center gap-2">{children}</div>
      <KpiChips kpi={kpi} className="absolute left-0 top-0" />
    </div>
  );
});
