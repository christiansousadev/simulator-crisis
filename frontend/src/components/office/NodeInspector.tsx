import { Crosshair, X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

const STATUS_STYLES: Record<string, string> = {
  healthy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  degraded: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  down: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

interface NodeInspectorProps {
  onFocusService?: (serviceId: string) => void;
}

// SLIDE-IN DIAGNOSTICS DRAWER FOR THE CURRENTLY SELECTED RACK OR DESK, ANCHORED TO THE LEFT EDGE
export default function NodeInspector({ onFocusService }: NodeInspectorProps) {
  const t = useTranslation();
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const service = useGameStore((s) => s.telemetry.services.find((svc) => svc.id === selectedServiceId));
  const selectService = useGameStore((s) => s.selectService);

  // always mounted (rather than returning null) so the closing transition can play out smoothly
  const open = Boolean(service);

  return (
    <div
      className={`absolute inset-y-0 left-0 z-30 w-60 sm:w-64 bg-slate-900/85 backdrop-blur-xl border-r border-slate-700/60 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "-translate-x-full pointer-events-none"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {service && (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 shrink-0">
            <span className="text-sm font-bold text-slate-100 truncate pr-2">{service.name}</span>
            <button
              onClick={() => selectService(null)}
              className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 transition-colors"
              title={t.common.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between shrink-0">
            <button
              onClick={() => onFocusService?.(service.id)}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded border border-sky-500/40 bg-sky-950/50 hover:bg-sky-900/60 text-sky-300 text-xs font-semibold active:scale-95 transition-all"
            >
              <Crosshair className="w-3.5 h-3.5" />
              {t.office.focusService}
            </button>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs font-mono text-slate-300 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide" style={{ fontSize: 10 }}>
                {t.nodeInspector.status}
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase ${STATUS_STYLES[service.status]}`}>
                {t.status[service.status]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide" style={{ fontSize: 10 }}>
                {t.nodeInspector.tier}
              </span>
              <span className="text-slate-200">{service.tier}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide" style={{ fontSize: 10 }}>
                {t.nodeInspector.latency}
              </span>
              <span className="text-slate-200">{service.latency_ms}ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide" style={{ fontSize: 10 }}>
                {t.nodeInspector.errorRate}
              </span>
              <span className="text-slate-200">{(service.error_rate * 100).toFixed(2)}%</span>
            </div>
            {service.dependencies.length > 0 && (
              <div className="pt-2 border-t border-slate-700/60">
                <span className="text-slate-500 uppercase tracking-wide" style={{ fontSize: 10 }}>
                  {t.nodeInspector.upstream}
                </span>
                <p className="text-slate-300 mt-1">{service.dependencies.join(", ")}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
