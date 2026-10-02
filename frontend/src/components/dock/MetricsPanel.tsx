import { useMemo } from "react";
import { useGameStore } from "../../store/useGameStore";
import LiveSparkline from "../common/LiveSparkline";

interface MetricPoint {
  tick: number;
  avgLatencyMs: number;
  errorRatePct: number;
  sla: number;
}

// TACTICAL METRICS DASHBOARD – live charts of SLA, latency, and error rate from metricsHistory
export default function MetricsPanel() {
  const metricsHistory = useGameStore((s) => s.metricsHistory);
  const telemetry = useGameStore((s) => s.telemetry);

  const slaData = useMemo(() => metricsHistory.map((m) => m.throughputProxy * 100), [metricsHistory]);
  const latencyData = useMemo(() => metricsHistory.map((m) => m.avgLatencyMs), [metricsHistory]);
  const errorData = useMemo(() => metricsHistory.map((m) => m.errorRatePct), [metricsHistory]);

  // current live point — always show even if history is empty
  const liveSla = telemetry.sla_percentage;
  const liveLatency = useMemo(
    () =>
      telemetry.services.length
        ? Math.round(telemetry.services.reduce((s, v) => s + v.latency_ms, 0) / telemetry.services.length)
        : 0,
    [telemetry.services]
  );
  const liveError = useMemo(
    () =>
      telemetry.services.length
        ? (telemetry.services.reduce((s, v) => s + v.error_rate, 0) / telemetry.services.length) * 100
        : 0,
    [telemetry.services]
  );

  const hasData = slaData.length > 1;

  const metrics = [
    {
      key: "sla",
      label: "SLA %",
      value: `${liveSla.toFixed(2)}%`,
      data: hasData ? slaData : [liveSla],
      tone: liveSla >= 99.9 ? "emerald" : liveSla >= 99.0 ? "amber" : "rose",
      min: 95,
      max: 100,
      sublabel: liveSla >= 99.9 ? "Nominal" : liveSla >= 99.0 ? "Degraded" : "⚠ Breach Risk",
    },
    {
      key: "latency",
      label: "Avg Latency",
      value: `${liveLatency}ms`,
      data: hasData ? latencyData : [liveLatency],
      tone: liveLatency < 100 ? "cyan" : liveLatency < 300 ? "amber" : "rose",
      sublabel: liveLatency < 100 ? "Healthy" : liveLatency < 300 ? "Elevated" : "⚠ Critical",
    },
    {
      key: "error",
      label: "Error Rate",
      value: `${liveError.toFixed(2)}%`,
      data: hasData ? errorData : [liveError],
      tone: liveError < 1 ? "emerald" : liveError < 5 ? "amber" : "rose",
      min: 0,
      sublabel: liveError < 1 ? "Normal" : liveError < 5 ? "Elevated" : "⚠ Severe",
    },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((m) => (
            <div
              key={m.key}
              className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                  {m.label}
                </span>
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                    m.tone === "emerald"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : m.tone === "cyan"
                      ? "bg-cyan-500/15 text-cyan-400"
                      : m.tone === "amber"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {m.sublabel}
                </span>
              </div>
              <span
                className={`text-2xl font-black font-mono tabular-nums ${
                  m.tone === "emerald"
                    ? "text-emerald-300"
                    : m.tone === "cyan"
                    ? "text-cyan-300"
                    : m.tone === "amber"
                    ? "text-amber-300"
                    : "text-rose-300"
                }`}
              >
                {m.value}
              </span>
              <div className="bg-slate-950/60 rounded-lg p-1.5 border border-slate-800/50">
                <LiveSparkline
                  data={m.data as unknown as number[]}
                  tone={m.tone === "cyan" || m.tone === "emerald" || m.tone === "amber" || m.tone === "rose" ? m.tone : "cyan"}
                  height={48}
                  showArea={true}
                  min={"min" in m ? m.min : undefined}
                  max={"max" in m ? m.max : undefined}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Per-service status table */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/80 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
              Live Service Telemetry
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Tick {telemetry.tick}</span>
          </div>
          <div className="divide-y divide-slate-800/40">
            {telemetry.services.map((svc) => {
              const statusColor =
                svc.status === "healthy"
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                  : svc.status === "degraded"
                  ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                  : "text-rose-400 bg-rose-500/10 border-rose-500/30";
              return (
                <div
                  key={svc.id}
                  className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-200">{svc.name}</span>
                    <span className="ml-2 text-[9px] text-slate-500 font-mono">{svc.id}</span>
                  </div>
                  <span
                    className={`text-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}
                  >
                    {svc.status.toUpperCase()}
                  </span>
                  <span className="text-right font-mono tabular-nums text-slate-300">
                    {svc.latency_ms}ms
                  </span>
                  <span
                    className={`text-right font-mono tabular-nums ${
                      svc.error_rate > 0.05
                        ? "text-rose-400"
                        : svc.error_rate > 0.01
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {(svc.error_rate * 100).toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
