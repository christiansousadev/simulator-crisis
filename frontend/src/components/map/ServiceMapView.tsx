import { memo, useMemo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import type { Incident, InfrastructureNode, Service, ServiceStatus } from "../../types/game";
import { GRAPH_HEIGHT, GRAPH_WIDTH, layoutServiceGraph, NODE_HEIGHT, NODE_WIDTH } from "./serviceGraphLayout";
import "./serviceMap.css";

const STATUS_COLOR: Record<ServiceStatus, string> = { healthy: "#34d399", degraded: "#fbbf24", down: "#fb7185" };

// the node is 168 wide: longer names are cut (the full name stays in the tooltip and aria-label)
const NAME_MAX_CHARS = 17;

const INFRA_SHORT: Record<InfrastructureNode["node_type"], string> = {
  redis_cache: "Redis",
  kafka_queue: "Kafka",
  db_read_replica: "Replica",
  nginx_lb: "NGINX",
};

interface NodeProps {
  service: Service;
  x: number;
  y: number;
  selected: boolean;
  incidents: number;
  onSelect: (id: string) => void;
}

const GraphNodeView = memo(function GraphNodeView({ service, x, y, selected, incidents, onSelect }: NodeProps) {
  const t = useTranslation();
  const color = STATUS_COLOR[service.status];
  const statusLabel = t.status[service.status];
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={t.evolution.stage.nodeAria(service.name, statusLabel)}
      aria-pressed={selected}
      onClick={() => onSelect(service.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(service.id);
        }
      }}
      transform={`translate(${x} ${y})`}
      className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-white"
    >
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={10}
        fill="#0f172a"
        stroke={color}
        strokeWidth={selected ? 3.5 : 2}
        className={service.status === "down" ? "sm-node-pulse" : undefined}
      />
      <circle cx={16} cy={18} r={5} fill={color} />
      <text x={30} y={22} fill="#e2e8f0" fontSize={13} fontWeight={700}>
        <title>{service.name}</title>
        {service.name.length > NAME_MAX_CHARS ? `${service.name.slice(0, NAME_MAX_CHARS - 1)}…` : service.name}
      </text>
      <text x={14} y={46} fill="#94a3b8" fontSize={11}>
        {t.evolution.stage.latency}: {Math.round(service.latency_ms)} ms
      </text>
      <text x={14} y={62} fill="#94a3b8" fontSize={11}>
        {t.evolution.stage.errors}: {(service.error_rate * 100).toFixed(1)}%
      </text>
      <text x={NODE_WIDTH - 12} y={76} fill={color} fontSize={10} fontWeight={700} textAnchor="end">
        {statusLabel.toUpperCase()}
      </text>
      {incidents > 0 && (
        <g transform={`translate(${NODE_WIDTH - 16} 18)`}>
          <circle r={9} fill="#e11d48" />
          <text y={4} fill="#fff" fontSize={11} fontWeight={800} textAnchor="middle">
            {incidents}
          </text>
        </g>
      )}
    </g>
  );
});

function activeIncidentCounts(incidents: ReadonlyArray<Incident>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const i of incidents) counts.set(i.service_id, (counts.get(i.service_id) ?? 0) + 1);
  return counts;
}

// ALTERNATIVE STAGE VIEW: THE SERVICE DEPENDENCY GRAPH. Edges point from an upstream dependency to
// the service that depends on it -- the direction a failure cascades -- and speed up / turn red when
// the upstream is unhealthy. Purely a read-only projection of telemetry; nothing is computed here.
export default memo(function ServiceMapView() {
  const t = useTranslation();
  const copy = t.evolution.stage;
  const services = useGameStore((s) => s.telemetry.services);
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const infra = useGameStore((s) => s.telemetry.infrastructure_nodes);
  const selectedId = useGameStore((s) => s.selectedServiceId);
  const selectService = useGameStore((s) => s.selectService);

  const layout = useMemo(() => layoutServiceGraph(services), [services]);
  const counts = useMemo(() => activeIncidentCounts(incidents), [incidents]);
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const infraSummary = useMemo(() => {
    const tally = new Map<string, number>();
    for (const n of infra) {
      const name = INFRA_SHORT[n.node_type] ?? n.node_type;
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    return [...tally].map(([name, n]) => `${name}${n > 1 ? ` ×${n}` : ""}`);
  }, [infra]);

  if (services.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">{copy.noServices}</div>;
  }

  return (
    <section aria-label={copy.graphTitle} className="relative flex min-h-0 flex-1 flex-col bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-slate-200">{copy.graphTitle}</h2>
        <ul className="flex items-center gap-3 text-caption text-slate-300">
          {(["healthy", "degraded", "down"] as const).map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden />
              {status === "healthy" ? copy.legendHealthy : status === "degraded" ? copy.legendDegraded : copy.legendDown}
            </li>
          ))}
          {infraSummary.length > 0 && <li className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">{infraSummary.join(" · ")}</li>}
        </ul>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <svg viewBox={`-20 -20 ${GRAPH_WIDTH + 40} ${GRAPH_HEIGHT + 40}`} className="h-full max-h-full w-full max-w-6xl" role="group" aria-label={copy.graphTitle}>
          <defs>
            {(["healthy", "degraded", "down"] as const).map((status) => (
              <marker key={status} id={`sm-arrow-${status}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={STATUS_COLOR[status]} />
              </marker>
            ))}
          </defs>
          {layout.edges.map((edge) => {
            const a = pos.get(edge.from);
            const b = pos.get(edge.to);
            const upstream = byId.get(edge.from);
            if (!a || !b || !upstream) return null;
            const x1 = a.x + NODE_WIDTH;
            const y1 = a.y + NODE_HEIGHT / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_HEIGHT / 2;
            const mid = (x1 + x2) / 2;
            const unhealthy = upstream.status !== "healthy";
            return (
              <path
                key={`${edge.from}->${edge.to}`}
                d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2 - 2} ${y2}`}
                fill="none"
                stroke={STATUS_COLOR[upstream.status]}
                strokeWidth={unhealthy ? 2.5 : 1.5}
                strokeOpacity={unhealthy ? 0.95 : 0.5}
                markerEnd={`url(#sm-arrow-${upstream.status})`}
                className={`sm-edge-flow ${upstream.status === "down" ? "sm-edge-flow-fast" : ""}`}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const service = byId.get(n.id);
            return service ? (
              <GraphNodeView key={n.id} service={service} x={n.x} y={n.y} selected={n.id === selectedId} incidents={counts.get(n.id) ?? 0} onSelect={selectService} />
            ) : null;
          })}
        </svg>
      </div>
      {selected && (
        <div className="border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-caption text-slate-300" role="status">
          <span className="font-semibold text-slate-100">{selected.name}</span>
          {selected.dependencies.length > 0 ? (
            <>
              {" "}
              {copy.dependsOn} {selected.dependencies.map((d) => byId.get(d)?.name ?? d).join(", ")}. {copy.cascadeRisk}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
});
