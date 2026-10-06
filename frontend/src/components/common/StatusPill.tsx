import { memo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { IncidentPipelineStatus } from "../../utils/incidentPipeline";

const TONE: Record<IncidentPipelineStatus, string> = {
  new: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  acknowledged: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  investigating: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  mitigating: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

interface StatusPillProps {
  status: IncidentPipelineStatus;
  className?: string;
}

// shared incident pipeline-state pill: new -> acknowledged -> investigating -> mitigating -> resolved
export default memo(function StatusPill({ status, className = "" }: StatusPillProps) {
  const t = useTranslation();
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-micro font-bold uppercase leading-none tracking-wide transition-colors duration-base ${TONE[status]} ${className}`}
    >
      {t.incidents.statusPill[status]}
    </span>
  );
});
