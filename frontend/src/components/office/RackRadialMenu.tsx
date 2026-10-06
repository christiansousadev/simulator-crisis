import type { KeyboardEvent } from "react";
import { memo } from "react";
import { Crosshair, FileSearch, Terminal, X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";
import { project } from "./isoMath";
import "./officeLife.css";

interface RackRadialMenuProps {
  service: Service;
  gridX: number;
  gridY: number;
  onFocusRack: () => void;
  onClose: () => void;
}

const STAGGER_MS = 45;

// ACTION RING AROUND THE SELECTED RACK: FOCUS, LOG TRIAGE, INCIDENT DETAIL, CLOSE. it scales in and its
// buttons pop one after another; the two incident actions are disabled, with the reason on hover and
// for assistive tech, while the service has no open incident.
function RackRadialMenu({ service, gridX, gridY, onFocusRack, onClose }: RackRadialMenuProps) {
  const t = useTranslation();
  const incident = useGameStore((s) => s.telemetry.active_incidents.find((i) => i.service_id === service.id));
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);
  const openIncidentDetail = useGameStore((s) => s.openIncidentDetail);

  // center anchor of this rack in isometric SVG space
  const center = project(gridX + 0.35, gridY + 0.35, 0.5);

  const radius = 54;
  const buttons = [
    {
      id: "focus",
      label: t.officeLife.radial.focus,
      icon: Crosshair,
      angle: -90, // Top
      color: "#38bdf8",
      disabled: false,
      onClick: onFocusRack,
    },
    {
      id: "triage",
      label: incident ? t.officeLife.radial.triage : t.officeLife.radial.noFault,
      icon: Terminal,
      angle: 0, // Right
      color: incident ? "#f59e0b" : "#64748b",
      disabled: !incident,
      onClick: () => {
        if (incident) openTriageTerminal(incident.id);
      },
    },
    {
      id: "detail",
      label: t.officeLife.radial.detail,
      icon: FileSearch,
      angle: 90, // Bottom
      color: incident ? "#ef4444" : "#64748b",
      disabled: !incident,
      onClick: () => {
        if (incident) openIncidentDetail(incident);
      },
    },
    {
      id: "close",
      label: t.officeLife.radial.close,
      icon: X,
      angle: 180, // Left
      color: "#94a3b8",
      disabled: false,
      onClick: onClose,
    },
  ];

  return (
    <g
      className="pointer-events-auto select-none"
      style={{ transform: `translate(${center.x}px, ${center.y}px)` }}
      role="group"
      aria-label={t.officeLife.radial.ariaLabel(service.name)}
    >
      {/* the scale-in lives on an inner group: the outer one positions itself with a css transform */}
      <g className="ol-radial">
        {/* Orbital tactical ring */}
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill="none"
          stroke="rgba(56,189,248,0.25)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          className="animate-spin-slow"
        />
        <circle cx={0} cy={0} r={radius + 10} fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth={1} />

        {/* Crosshair guide lines */}
        <line x1={-radius - 8} y1={0} x2={-radius + 4} y2={0} stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
        <line x1={radius - 4} y1={0} x2={radius + 8} y2={0} stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
        <line x1={0} y1={-radius - 8} x2={0} y2={-radius + 4} stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
        <line x1={0} y1={radius - 4} x2={0} y2={radius + 8} stroke="rgba(56,189,248,0.5)" strokeWidth={1} />

        {/* Radial action nodes */}
        {buttons.map((btn, index) => {
          const rad = (btn.angle * Math.PI) / 180;
          const bx = Math.cos(rad) * radius;
          const by = Math.sin(rad) * radius;
          const Icon = btn.icon;
          const activate = () => {
            if (!btn.disabled) btn.onClick();
          };

          return (
            <g key={btn.id} transform={`translate(${bx}, ${by})`}>
              <g
                role="button"
                tabIndex={btn.disabled ? -1 : 0}
                aria-label={btn.label}
                aria-disabled={btn.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  activate();
                }}
                onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    activate();
                  }
                }}
                className={`ol-radial-btn ${btn.disabled ? "opacity-35 cursor-not-allowed" : "cursor-pointer group"}`}
                style={{ animationDelay: `${index * STAGGER_MS}ms` }}
              >
                {btn.disabled && <title>{t.officeLife.radial.noOpenIncident}</title>}
                <circle
                  cx={0}
                  cy={0}
                  r={13}
                  fill="#090d16"
                  stroke={btn.color}
                  strokeWidth={1.5}
                  className="group-hover:stroke-sky-300 transition-colors shadow-lg"
                />
                {/* Center icon */}
                <foreignObject x={-8} y={-8} width={16} height={16} className="overflow-visible pointer-events-none">
                  <div className="flex items-center justify-center w-full h-full text-slate-200 group-hover:text-white transition-colors">
                    <Icon className="w-3.5 h-3.5" style={{ color: btn.color }} />
                  </div>
                </foreignObject>

                {/* Label banner */}
                <text
                  x={0}
                  y={by < 0 ? -17 : 22}
                  textAnchor="middle"
                  fill={btn.color}
                  style={{
                    fontSize: 6.5,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    letterSpacing: "0.1em",
                    pointerEvents: "none",
                    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  }}
                >
                  {btn.label}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </g>
  );
}

export default memo(RackRadialMenu);
