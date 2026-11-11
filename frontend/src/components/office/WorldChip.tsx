import type { CSSProperties } from "react";
import "./officeLife.css";

export type WorldChipTone = "good" | "cost" | "bad";

const TONE: Record<WorldChipTone, { fill: string; stroke: string; text: string }> = {
  good: { fill: "#064e3b", stroke: "#34d399", text: "#a7f3d0" },
  cost: { fill: "#451a03", stroke: "#f59e0b", text: "#fde68a" },
  bad: { fill: "#450a0a", stroke: "#f87171", text: "#fecaca" },
};

interface WorldChipProps {
  // anchor in scene (svg) coordinates; snapped to whole pixels
  x: number;
  y: number;
  label: string;
  tone: WorldChipTone;
  testId?: string;
  // start later than a sibling chip so two chips don't overlap on the same frame
  delayMs?: number;
}

// VALUE CHIP RISING FROM THE OBJECT THAT EARNED IT (+SLA off a restored rack, -$ off a runbook, +XP
// off the engineer's desk). It reuses the 1.7s `ol-chip-rise`, lives in the scene svg (it pans and
// zooms with the office), and is motion-only: the HUD's own floating text still carries the number
// for reduced motion, so nothing here is the only place a value shows up.
export default function WorldChip({ x, y, label, tone, testId, delayMs = 0 }: WorldChipProps) {
  const c = TONE[tone];
  const width = Math.max(22, label.length * 5 + 10);
  return (
    <g transform={`translate(${Math.round(x)} ${Math.round(y)})`} pointerEvents="none" data-testid={testId}>
      <g
        className="ol-chip motion-only"
        data-delayed={delayMs > 0 ? "" : undefined}
        style={{ "--chip-delay": `${delayMs}ms` } as CSSProperties}
        shapeRendering="crispEdges"
      >
        <rect x={-width / 2} y={-8} width={width} height={11} fill={c.fill} stroke={c.stroke} strokeWidth={1} />
        <text
          x={0}
          y={0.5}
          textAnchor="middle"
          fill={c.text}
          style={{ fontSize: 6.5, fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.08em" }}
        >
          {label}
        </text>
      </g>
    </g>
  );
}
