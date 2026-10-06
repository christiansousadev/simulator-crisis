import { memo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { IncidentSeverity } from "../../types/game";
import { severityTone } from "../../utils/severity";

interface SeverityBadgeProps {
  severity: IncidentSeverity;
  className?: string;
}

// shared severity pill (P1..P4), reused by incident cards, the detail modal and office tooltips
// so severity always reads with the same color regardless of where it's shown
export default memo(function SeverityBadge({ severity, className = "" }: SeverityBadgeProps) {
  const t = useTranslation();
  const tone = severityTone(severity);
  return (
    <span className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-micro font-bold leading-none ${tone.badge} ${className}`}>
      {t.severities[severity]}
    </span>
  );
});
