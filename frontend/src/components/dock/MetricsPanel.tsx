import { BarChart2 } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";
import EmptyState from "../common/EmptyState";
import LiveSparkline from "../common/LiveSparkline";

type Tone = "emerald" | "cyan" | "amber" | "rose";

const BADGE_TONE: Record<Tone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  amber: "bg-amber-500/15 text-amber-300",
  rose: "bg-rose-500/15 text-rose-300",
};
const VALUE_TONE: Record<Tone, string> = {
  emerald: "text-emerald-300",
  cyan: "text-cyan-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
};

interface MetricCardProps {
  label: string;
  value: string;
  sublabel: string;
  tone: Tone;
  data: number[];
  min?: number;
  max?: number;
}

const MetricCard = memo(function MetricCard({ label, value, sublabel, tone, data, min, max }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800/80 bg-slate-900/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-xs font-bold uppercase tracking-widest text-slate-300">{label}</span>
        <span className={`rounded px-1.5 py-0.5 text-micro font-semibold transition-colors duration-slow ${BADGE_TONE[tone]}`}>{sublabel}</span>
      </div>
      <span className={`font-mono text-2xl font-black tabular-nums transition-colors duration-slow ${VALUE_TONE[tone]}`}>{value}</span>
      <div className="rounded-lg border border-slate-800/50 bg-slate-950/60 p-1.5">
        <LiveSparkline data={data} tone={tone} height={48} showArea min={min} max={max} />
      </div>
    </div>
  );
});

const ServiceRow = memo(function ServiceRow({ svc }: { svc: Service }) {
  const t = useTranslation();
  const statusColor =
    svc.status === "healthy"
      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
      : svc.status === "degraded"
      ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
      : "text-rose-300 bg-rose-500/10 border-rose-500/30";
  return (
    <div className="grid grid-cols-[1fr_5.5rem_4.5rem_4.5rem] items-center gap-2 px-3 py-2 text-xs">
      <div className="min-w-0 truncate">
        <span className="font-semibold text-slate-100">{svc.name}</span>
        <span className="ml-2 font-mono text-micro text-slate-400">{svc.id}</span>
      </div>
      <span className={`rounded-full border px-1.5 py-0.5 text-center text-micro font-bold uppercase ${statusColor}`}>{t.status[svc.status]}</span>
      <span className="text-right font-mono tabular-nums text-slate-200">{svc.latency_ms}ms</span>
      <span
        className={`text-right font-mono tabular-nums ${
          svc.error_rate > 0.05 ? "text-rose-300" : svc.error_rate > 0.01 ? "text-amber-300" : "text-emerald-300"
        }`}
      >
        {(svc.error_rate * 100).toFixed(1)}%
      </span>
    </div>
  );
});

// TACTICAL METRICS DASHBOARD: live charts of SLA, latency and error rate from metricsHistory, plus a
// per-service table. The SLA card plots the real sla_percentage series (it used to plot a
// throughput proxy under the "SLA %" name).
export default function MetricsPanel() {
  const t = useTranslation();
  const metricsHistory = useGameStore((s) => s.metricsHistory);
  const services = useGameStore((s) => s.telemetry.services);
  const liveSla = useGameStore((s) => s.telemetry.sla_percentage);
  const tick = useGameStore((s) => s.telemetry.tick);

  const slaData = useMemo(() => metricsHistory.map((m) => m.sla).filter((v) => Number.isFinite(v)), [metricsHistory]);
  const latencyData = useMemo(() => metricsHistory.map((m) => m.avgLatencyMs), [metricsHistory]);
  const errorData = useMemo(() => metricsHistory.map((m) => m.errorRatePct), [metricsHistory]);

  const liveLatency = useMemo(
    () => (services.length ? Math.round(services.reduce((s, v) => s + v.latency_ms, 0) / services.length) : 0),
    [services]
  );
  const liveError = useMemo(
    () => (services.length ? (services.reduce((s, v) => s + v.error_rate, 0) / services.length) * 100 : 0),
    [services]
  );

  const hasData = slaData.length > 1;
  const m = t.hud.metrics;

  if (services.length === 0 && metricsHistory.length === 0) {
    return <EmptyState icon={BarChart2} title={m.emptyTitle} hint={m.emptyHint} />;
  }

  const slaTone: Tone = liveSla >= 99.9 ? "emerald" : liveSla >= 99.0 ? "amber" : "rose";
  const latencyTone: Tone = liveLatency < 100 ? "cyan" : liveLatency < 300 ? "amber" : "rose";
  const errorTone: Tone = liveError < 1 ? "emerald" : liveError < 5 ? "amber" : "rose";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2">
          <MetricCard
            label={m.sla}
            value={`${liveSla.toFixed(2)}%`}
            sublabel={liveSla >= 99.9 ? m.sla_states.nominal : liveSla >= 99.0 ? m.sla_states.degraded : m.sla_states.breachRisk}
            tone={slaTone}
            data={hasData ? slaData : [liveSla]}
            min={95}
            max={100}
          />
          <MetricCard
            label={m.latency}
            value={`${liveLatency}ms`}
            sublabel={liveLatency < 100 ? m.latency_states.healthy : liveLatency < 300 ? m.latency_states.elevated : m.latency_states.critical}
            tone={latencyTone}
            data={hasData ? latencyData : [liveLatency]}
          />
          <MetricCard
            label={m.errorRate}
            value={`${liveError.toFixed(2)}%`}
            sublabel={liveError < 1 ? m.error_states.normal : liveError < 5 ? m.error_states.elevated : m.error_states.severe}
            tone={errorTone}
            data={hasData ? errorData : [liveError]}
            min={0}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/80">
          <div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-2">
            <span className="font-heading text-xs font-bold uppercase tracking-widest text-slate-300">{m.liveTelemetry}</span>
            <span className="font-mono text-micro text-slate-400">{m.tick(tick)}</span>
          </div>
          <div className="divide-y divide-slate-800/40">
            {services.map((svc) => (
              <ServiceRow key={svc.id} svc={svc} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
