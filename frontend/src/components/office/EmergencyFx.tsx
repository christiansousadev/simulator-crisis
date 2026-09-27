import { project } from "./isoMath";

interface RedAlertOverlayProps {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// DEFCON RED-ALERT AMBIENT: A DARKENING VIGNETTE OVER THE WHOLE FLOOR PLAN, DROPPED IN BEHIND
// EVERY PROP SO NORMAL LIGHTING READS AS "EMERGENCY POWER ONLY". THIS IS DELIBERATELY A NEAR-BLACK
// WASH RATHER THAN A TINTED RED ONE -- THE COLOR MATRIX GRADE ALREADY DESATURATES/COOLS THE SCENE,
// AND ONLY THE BEACONS THEMSELVES SHOULD READ AS RED, LIKE SPOTLIGHTS CUTTING THROUGH DARKNESS.
export function RedAlertOverlay({ minX, minY, maxX, maxY }: RedAlertOverlayProps) {
  const corners = [
    project(minX, minY, 0),
    project(maxX, minY, 0),
    project(maxX, maxY, 0),
    project(minX, maxY, 0),
  ];
  const floorPath = `M ${corners.map((p) => `${p.x},${p.y}`).join(" L ")} Z`;
  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={floorPath} fill="#020617" opacity={0.4} className="animate-glow-pulse" />
    </g>
  );
}

interface BeaconProps {
  x: number;
  y: number;
  z?: number;
}

// CEILING-MOUNTED EMERGENCY BEACON WITH A ROTATING VOLUMETRIC SWEEP, FLASHING DURING A P1 INCIDENT
export function EmergencyBeacon({ x, y, z = 1.95 }: BeaconProps) {
  const p = project(x, y, z);
  return (
    <g>
      {/* rotating light sweep, layered under the dome for a volumetric feel */}
      <g style={{ transformOrigin: `${p.x}px ${p.y}px` }} className="animate-beacon-sweep">
        <path d={`M ${p.x},${p.y} L ${p.x - 34},${p.y - 6} A 36 36 0 0 1 ${p.x - 24},${p.y - 26} Z`} fill="#ef4444" opacity={0.22} />
      </g>
      <circle cx={p.x} cy={p.y} r={5.5} fill="#7f1d1d" />
      <circle
        cx={p.x}
        cy={p.y}
        r={4}
        fill="#ef4444"
        className="animate-beacon-flash"
        style={{ filter: "drop-shadow(0 0 6px #ef4444)" }}
      />
    </g>
  );
}
