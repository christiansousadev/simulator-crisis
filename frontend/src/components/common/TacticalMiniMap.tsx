import { AlertCircle, Crosshair, LocateFixed, MapPin, Maximize2, Minimize2 } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { selectDefconLevel } from "../../utils/defcon";
import { getCameraSnapshot, subscribeCamera } from "../office/cameraBus";
import { userToGrid, visibleWorldQuad } from "../office/cameraMath";
import {
  BOARDROOM_ORIGIN,
  BOARDROOM_SIZE,
  BREAKROOM_ORIGIN,
  BREAKROOM_SIZE,
  CAMERA_ORIGIN,
  ENGINEERING_ORIGIN,
  ENGINEERING_SIZE,
  MAP_GRID,
  RECEPTION_MAT_ORIGIN,
  RECEPTION_MAT_SIZE,
  SERVER_ROOM_ORIGIN,
  SERVER_ROOM_SIZE,
  deskGridPosition,
} from "../office/sceneLayout";
import { rackGridPosition } from "../office/ServerRoom";
import { Service } from "../../types/game";

interface TacticalMiniMapProps {
  onCenterCrisis?: () => void;
  onFocusService?: (serviceId: string) => void;
  onPanToWorld?: (gx: number, gy: number, opts?: { snap?: boolean }) => void;
  onResetView?: () => void;
}

const MAP_W = 180;
const MAP_H = 110;
const toMapX = (gx: number) => (gx / MAP_GRID.width) * MAP_W;
const toMapY = (gy: number) => (gy / MAP_GRID.depth) * MAP_H;

function statusColor(srv: Pick<Service, "status">) {
  if (srv.status === "down") return "#ef4444";
  if (srv.status === "degraded") return "#f59e0b";
  return "#10b981";
}

interface ZoneProps {
  origin: { x: number; y: number };
  size: { width: number; depth: number };
  fill: string;
  stroke: string;
  label: string;
  labelColor: string;
  hot?: boolean;
}

function Zone({ origin, size, fill, stroke, label, labelColor, hot }: ZoneProps) {
  return (
    <>
      <rect
        x={toMapX(origin.x)}
        y={toMapY(origin.y)}
        width={toMapX(size.width)}
        height={toMapY(size.depth)}
        rx={2}
        fill={fill}
        stroke={hot ? "#ef4444" : stroke}
        strokeWidth={hot ? 1.5 : 0.8}
        strokeDasharray={hot ? "3 2" : undefined}
        className={hot ? "animate-pulse" : undefined}
      />
      <text x={toMapX(origin.x + 0.3)} y={toMapY(origin.y + 0.7)} fill={labelColor} style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>
        {label}
      </text>
    </>
  );
}

// TOP-DOWN RADAR OF THE FLOOR PLAN. Racks sit where ServerRoom really puts them, a frame shows
// what the camera currently sees, and the whole map is a pan control: click to fly there, drag to
// scrub. Rack dots keep their own click (focus that rack) because the pan handler lives on the
// svg and ignores presses that start on a node.
function TacticalMiniMap({ onCenterCrisis, onFocusService, onPanToWorld, onResetView }: TacticalMiniMapProps) {
  const t = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const services = useGameStore((s) => s.telemetry.services);
  const engineers = useGameStore((s) => s.telemetry.engineers);
  const hasIncident = useGameStore((s) => s.telemetry.active_incidents.length > 0);
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const hot = useGameStore((s) => selectDefconLevel(s) <= 3);

  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<SVGPolygonElement>(null);
  const dragging = useRef(false);

  const serviceIds = useMemo(() => services.map((s) => s.id), [services]);

  // the viewport frame follows the camera imperatively: no React render per animation frame
  useEffect(() => {
    if (collapsed) return;
    const update = () => {
      const poly = frameRef.current;
      if (!poly) return;
      const { camera, view } = getCameraSnapshot();
      if (view.width <= 0 || view.height <= 0) {
        poly.setAttribute("points", "");
        return;
      }
      const pts = visibleWorldQuad(camera, view, CAMERA_ORIGIN)
        .map((p) => userToGrid(p))
        .map((g) => `${toMapX(g.x).toFixed(1)},${toMapY(g.y).toFixed(1)}`)
        .join(" ");
      poly.setAttribute("points", pts);
    };
    update();
    return subscribeCamera(update);
  }, [collapsed]);

  const worldFromEvent = (evt: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return {
      gx: ((evt.clientX - rect.left) / rect.width) * MAP_GRID.width,
      gy: ((evt.clientY - rect.top) / rect.height) * MAP_GRID.depth,
    };
  };

  const handlePointerDown = (evt: PointerEvent<SVGSVGElement>) => {
    if (evt.button !== 0) return;
    if ((evt.target as Element).closest("[data-minimap-node]")) return;
    const w = worldFromEvent(evt);
    if (!w) return;
    dragging.current = true;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    onPanToWorld?.(w.gx, w.gy);
  };
  const handlePointerMove = (evt: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const w = worldFromEvent(evt);
    if (w) onPanToWorld?.(w.gx, w.gy, { snap: true });
  };
  const handlePointerUp = (evt: PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    if (evt.currentTarget.hasPointerCapture(evt.pointerId)) evt.currentTarget.releasePointerCapture(evt.pointerId);
  };

  const nodeKeyDown = (evt: KeyboardEvent, id: string) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      onFocusService?.(id);
    }
  };

  return (
    <aside
      aria-label={t.officeCore.radarLabel}
      data-camera-ignore
      className="absolute bottom-12 right-3 z-30 flex flex-col items-end pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {hasIncident && (
          <button
            onClick={onCenterCrisis}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 border border-rose-500/60 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.3)] animate-pulse hover:bg-rose-900"
            title={t.officeCore.jumpToCrisis}
          >
            <AlertCircle className="w-3 h-3 text-rose-400" />
            {t.officeCore.crisis}
          </button>
        )}
        <button
          onClick={onResetView}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 backdrop-blur-md"
          title={`${t.officeCore.resetView} (Home)`}
          aria-label={t.officeCore.resetView}
        >
          <LocateFixed className="w-3 h-3 text-sky-400" />
        </button>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 backdrop-blur-md"
          title={collapsed ? t.officeCore.expandRadar : t.officeCore.collapseRadar}
          aria-expanded={!collapsed}
        >
          <MapPin className="w-3 h-3 text-sky-400" />
          <span>{t.officeCore.radar}</span>
          {collapsed ? <Maximize2 className="w-2.5 h-2.5 ml-0.5" /> : <Minimize2 className="w-2.5 h-2.5 ml-0.5" />}
        </button>
      </div>

      {!collapsed && (
        <div className="relative rounded-lg border border-slate-800/90 bg-slate-950/90 backdrop-blur-md p-1.5 shadow-2xl overflow-hidden animate-pop-in">
          {/* subtle scanline / radar grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(rgba(56,189,248,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.2) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          />

          <svg
            ref={svgRef}
            width={MAP_W}
            height={MAP_H}
            className="block select-none cursor-crosshair touch-none"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <Zone origin={SERVER_ROOM_ORIGIN} size={SERVER_ROOM_SIZE} fill="rgba(6, 182, 212, 0.08)" stroke="rgba(6, 182, 212, 0.4)" label={t.officeCore.zoneDataCenter} labelColor="#38bdf8" hot={hot} />
            <Zone origin={ENGINEERING_ORIGIN} size={ENGINEERING_SIZE} fill="rgba(59, 130, 246, 0.05)" stroke="rgba(59, 130, 246, 0.3)" label={t.officeCore.zoneWarRoom} labelColor="#60a5fa" />
            <Zone origin={BOARDROOM_ORIGIN} size={BOARDROOM_SIZE} fill="rgba(245, 158, 11, 0.05)" stroke="rgba(245, 158, 11, 0.3)" label={t.officeCore.zoneBoardroom} labelColor="#fbbf24" />
            <Zone origin={BREAKROOM_ORIGIN} size={BREAKROOM_SIZE} fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.3)" label={t.officeCore.zoneBreakroom} labelColor="#34d399" />
            <Zone origin={RECEPTION_MAT_ORIGIN} size={RECEPTION_MAT_SIZE} fill="rgba(148, 163, 184, 0.05)" stroke="rgba(148, 163, 184, 0.3)" label="" labelColor="#94a3b8" />

            {/* engineers, behind the rack nodes so a rack click is never swallowed */}
            {engineers.map((eng, i) => {
              let pos = eng.assigned_service_id ? deskGridPosition(eng.assigned_service_id, serviceIds) : null;
              if (eng.on_call_status === "resting") pos = { x: 9.5 + (i % 2) * 1.5, y: 10.5 };
              if (!pos) pos = { x: 10.5 + (i % 3) * 2.5, y: 5.8 };
              const isTired = eng.stamina < 30;
              return (
                <g key={eng.id} pointerEvents="none">
                  <title>{t.officeCore.engineerLabel(eng.name, eng.on_call_status)}</title>
                  <circle
                    cx={toMapX(pos.x)}
                    cy={toMapY(pos.y)}
                    r={2}
                    fill={eng.on_call_status === "resting" ? "#38bdf8" : isTired ? "#f59e0b" : "#60a5fa"}
                    stroke="#0f172a"
                    strokeWidth={0.5}
                  />
                </g>
              );
            })}

            {/* what the camera is looking at */}
            <polygon
              ref={frameRef}
              pointerEvents="none"
              fill="rgba(56,189,248,0.08)"
              stroke="#38bdf8"
              strokeWidth={1}
              strokeLinejoin="round"
            >
              <title>{t.officeCore.viewport}</title>
            </polygon>

            {/* rack nodes, drawn last so they sit on top of everything and keep their own clicks */}
            {services.map((srv) => {
              const pos = rackGridPosition(srv.id, services, SERVER_ROOM_ORIGIN.x, SERVER_ROOM_ORIGIN.y) ?? { x: 3, y: 2 };
              const mx = toMapX(pos.x + 0.35);
              const my = toMapY(pos.y + 0.25);
              const color = statusColor(srv);
              const fault = srv.status !== "healthy";
              return (
                <g
                  key={srv.id}
                  data-minimap-node
                  role="button"
                  tabIndex={0}
                  aria-label={t.officeCore.nodeLabel(srv.name, srv.status)}
                  className="cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusService?.(srv.id);
                  }}
                  onKeyDown={(e) => nodeKeyDown(e, srv.id)}
                >
                  <title>{`${srv.name} [${srv.status.toUpperCase()}]`}</title>
                  <circle cx={mx} cy={my} r={7} fill="transparent" />
                  {fault && (
                    <circle cx={mx} cy={my} r={srv.status === "down" ? 6 : 4.5} fill="none" stroke={color} strokeWidth={0.8} className="animate-ping" />
                  )}
                  {selectedServiceId === srv.id && (
                    <circle cx={mx} cy={my} r={5} fill="none" stroke="#38bdf8" strokeWidth={1} strokeDasharray="2 1" />
                  )}
                  <circle cx={mx} cy={my} r={3} fill={color} stroke="#0f172a" strokeWidth={0.8} />
                </g>
              );
            })}
          </svg>

          {/* Legend and status */}
          <div className="flex items-center justify-between gap-2 text-[8px] text-slate-400 font-mono mt-1 pt-1 border-t border-slate-900">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {t.officeCore.legendOk}
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1" /> {t.officeCore.legendFault}
            </span>
            <span className="flex items-center gap-1 text-sky-400 font-semibold">
              <Crosshair className="w-2.5 h-2.5" /> {t.officeCore.clickToNavigate}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}

export default memo(TacticalMiniMap);
