import { AlertCircle, Crosshair, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";

interface TacticalMiniMapProps {
  onCenterCrisis?: () => void;
  onFocusService?: (serviceId: string) => void;
  onPanToWorld?: (gx: number, gy: number) => void;
}

export default function TacticalMiniMap({ onCenterCrisis, onFocusService, onPanToWorld }: TacticalMiniMapProps) {
  const [collapsed, setCollapsed] = useState(false);
  const services = useGameStore((s) => s.telemetry.services);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const engineers = useGameStore((s) => s.telemetry.engineers);
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);

  const hasP1 = services.some((s) => s.tier === "critical" && s.status === "down");
  const hasIncident = activeIncidents.length > 0;

  // 2D floor projection for minimap (bounds ~22 x 14)
  const mapW = 180;
  const mapH = 110;
  const toMapX = (gx: number) => (gx / 23) * mapW;
  const toMapY = (gy: number) => (gy / 15) * mapH;

  const serverPositions: Record<string, { x: number; y: number }> = {
    "srv-auth": { x: 1.5, y: 1.5 },
    "srv-payment": { x: 3.5, y: 1.5 },
    "srv-api-gw": { x: 5.5, y: 1.5 },
    "srv-search": { x: 2.5, y: 3.0 },
    "srv-notify": { x: 4.5, y: 3.0 },
  };

  const getServiceColor = (srv: Service) => {
    if (srv.status === "down") return "#ef4444";
    if (srv.status === "degraded") return "#f59e0b";
    return "#10b981";
  };

  return (
    <aside
      aria-label="Tactical Mini-Map"
      className="absolute bottom-12 right-3 z-30 flex flex-col items-end pointer-events-auto"
    >
      <div className="flex items-center gap-1.5 mb-1">
        {hasIncident && (
          <button
            onClick={onCenterCrisis}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 border border-rose-500/60 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.3)] animate-pulse hover:bg-rose-900"
            title="Jump to Crisis"
          >
            <AlertCircle className="w-3 h-3 text-rose-400" />
            CRISIS
          </button>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 backdrop-blur-md"
          title={collapsed ? "Expand Radar" : "Collapse Radar"}
        >
          <MapPin className="w-3 h-3 text-sky-400" />
          <span>RADAR</span>
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

          <svg width={mapW} height={mapH} className="block select-none" viewBox={`0 0 ${mapW} ${mapH}`}>
            {/* Zone floor outlines */}
            {/* Server Vault */}
            <rect
              x={toMapX(0.5)}
              y={toMapY(0.5)}
              width={toMapX(7.4)}
              height={toMapY(3.6)}
              rx={2}
              fill="rgba(6, 182, 212, 0.08)"
              stroke={hasP1 ? "#ef4444" : "rgba(6, 182, 212, 0.4)"}
              strokeWidth={hasP1 ? 1.5 : 0.8}
              strokeDasharray={hasP1 ? "3 2" : undefined}
              className={hasP1 ? "animate-pulse" : undefined}
            />
            <text x={toMapX(0.8)} y={toMapY(1.2)} fill="#38bdf8" style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>
              DATA CENTER
            </text>

            {/* Engineering Bay */}
            <rect
              x={toMapX(9.9)}
              y={toMapY(0.5)}
              width={toMapX(12.0)}
              height={toMapY(7.5)}
              rx={2}
              fill="rgba(59, 130, 246, 0.05)"
              stroke="rgba(59, 130, 246, 0.3)"
              strokeWidth={0.8}
            />
            <text x={toMapX(10.2)} y={toMapY(1.2)} fill="#60a5fa" style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>
              WAR ROOM
            </text>

            {/* Boardroom */}
            <rect
              x={toMapX(0.5)}
              y={toMapY(9.0)}
              width={toMapX(7.0)}
              height={toMapY(4.5)}
              rx={2}
              fill="rgba(245, 158, 11, 0.05)"
              stroke="rgba(245, 158, 11, 0.3)"
              strokeWidth={0.8}
            />
            <text x={toMapX(0.8)} y={toMapY(9.8)} fill="#fbbf24" style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>
              BOARDROOM
            </text>

            {/* Breakroom */}
            <rect
              x={toMapX(8.2)}
              y={toMapY(9.0)}
              width={toMapX(7.5)}
              height={toMapY(4.5)}
              rx={2}
              fill="rgba(16, 185, 129, 0.05)"
              stroke="rgba(16, 185, 129, 0.3)"
              strokeWidth={0.8}
            />
            <text x={toMapX(8.5)} y={toMapY(9.8)} fill="#34d399" style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>
              BREAKROOM
            </text>

            {/* Server Nodes */}
            {services.map((srv) => {
              const pos = serverPositions[srv.id] || { x: 3, y: 2 };
              const mx = toMapX(pos.x);
              const my = toMapY(pos.y);
              const isSelected = selectedServiceId === srv.id;
              const isDown = srv.status === "down";
              const isDegraded = srv.status === "degraded";
              const color = getServiceColor(srv);

              return (
                <g
                  key={srv.id}
                  className="cursor-pointer"
                  onClick={() => {
                    onFocusService?.(srv.id);
                  }}
                >
                  <title>{`${srv.name} [${srv.status.toUpperCase()}]`}</title>
                  {(isDown || isDegraded) && (
                    <circle cx={mx} cy={my} r={isDown ? 6 : 4.5} fill="none" stroke={color} strokeWidth={0.8} className="animate-ping" />
                  )}
                  {isSelected && (
                    <circle cx={mx} cy={my} r={5} fill="none" stroke="#38bdf8" strokeWidth={1} strokeDasharray="2 1" />
                  )}
                  <circle cx={mx} cy={my} r={3} fill={color} stroke="#0f172a" strokeWidth={0.8} />
                </g>
              );
            })}

            {/* Engineers on Radar */}
            {engineers.map((eng, i) => {
              const deskMap: Record<string, { x: number; y: number }> = {
                "srv-auth": { x: 10.4, y: 1.2 },
                "srv-payment": { x: 12.9, y: 1.2 },
                "srv-api-gw": { x: 15.4, y: 1.2 },
                "srv-search": { x: 11.6, y: 3.8 },
                "srv-notify": { x: 14.1, y: 3.8 },
              };
              let pos = eng.assigned_service_id ? deskMap[eng.assigned_service_id] : null;
              if (eng.on_call_status === "resting") {
                pos = { x: 9.5 + (i % 2) * 1.5, y: 10.5 };
              }
              if (!pos) {
                pos = { x: 10.5 + (i % 3) * 2.5, y: 5.8 };
              }

              const mx = toMapX(pos.x);
              const my = toMapY(pos.y);
              const isTired = eng.stamina < 30;

              return (
                <g key={eng.id}>
                  <title>{`${eng.name} (${eng.on_call_status})`}</title>
                  <circle
                    cx={mx}
                    cy={my}
                    r={2}
                    fill={eng.on_call_status === "resting" ? "#38bdf8" : isTired ? "#f59e0b" : "#60a5fa"}
                    stroke="#0f172a"
                    strokeWidth={0.5}
                  />
                </g>
              );
            })}

            {/* Quick Interactive Floor Click */}
            <rect
              x={0}
              y={0}
              width={mapW}
              height={mapH}
              fill="transparent"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const gx = (clickX / mapW) * 23;
                const gy = (clickY / mapH) * 15;
                onPanToWorld?.(gx, gy);
              }}
              className="cursor-crosshair"
            />
          </svg>

          {/* Legend and status */}
          <div className="flex items-center justify-between text-[8px] text-slate-400 font-mono mt-1 pt-1 border-t border-slate-900">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> OK
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1" /> FAULT
            </span>
            <span className="flex items-center gap-1 text-sky-400 font-semibold">
              <Crosshair className="w-2.5 h-2.5" /> CLICK TO NAVIGATE
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
