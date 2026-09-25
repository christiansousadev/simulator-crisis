import { useTranslation } from "../../i18n/useTranslation";
import { Service } from "../../types/game";

interface OfficeTooltipProps {
  service: Service;
  x: number;
  y: number;
}

const STATUS_DOT: Record<Service["status"], string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-rose-500",
};

// SLEEK FLOATING GAME TOOLTIP SHOWN WHILE HOVERING A RACK, DESK OR EMPLOYEE
export default function OfficeTooltip({ service, x, y }: OfficeTooltipProps) {
  const t = useTranslation();

  return (
    <div
      className="absolute z-30 pointer-events-none bg-slate-900/95 text-white rounded-lg px-3 py-2 text-xs shadow-xl min-w-[150px]"
      style={{ left: x + 14, top: y - 12, transform: "translateY(-100%)" }}
    >
      <div className="flex items-center gap-1.5 font-semibold mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[service.status]}`} />
        {service.name}
      </div>
      <div className="flex items-center justify-between gap-4 text-[10px] text-slate-300 font-mono">
        <span>{t.status[service.status]}</span>
        <span>{service.latency_ms}ms</span>
        <span>{(service.error_rate * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
