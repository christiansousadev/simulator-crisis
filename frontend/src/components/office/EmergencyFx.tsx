import { project } from "./isoMath";

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
