import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { useBuildGhost } from "./buildGhost";
import IsoBox from "./IsoBox";
import { NODE_COLORS } from "./InfrastructureNodeSprite";
import { project } from "./isoMath";
import { infrastructureSlot } from "./officeLayout";
import "./officeLife.css";

// A TRANSLUCENT PREVIEW OF THE ARMED MODULE ON THE SHELF SLOT IT WILL LAND ON. placement is slot-based
// (the next free spot in front of the racks), so the ghost marks that exact slot rather than following
// the cursor to a place the node would never end up.
export default function BuildPlacementGhost() {
  const t = useTranslation();
  const armed = useBuildGhost((s) => s.armedNodeType);
  const buildModeActive = useGameStore((s) => s.buildModeActive);
  const count = useGameStore((s) => s.telemetry.infrastructure_nodes.length);
  if (!armed || !buildModeActive) return null;

  const slot = infrastructureSlot(count);
  const color = NODE_COLORS[armed] ?? "#64748b";
  const label = project(slot.x + 0.16, slot.y + 0.16, 0.5);
  const footprint = project(slot.x + 0.16, slot.y + 0.16, 0.02);

  return (
    <g pointerEvents="none" className="ol-ghost">
      <ellipse cx={footprint.x} cy={footprint.y} rx={16} ry={8} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="3 2" />
      <IsoBox x={slot.x} y={slot.y} z={0} w={0.32} d={0.32} h={0.3} color={color} topFactor={1.2} opacity={0.55} />
      <text
        x={label.x}
        y={label.y - 4}
        textAnchor="middle"
        fill={color}
        style={{ fontSize: 5.5, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.12em" }}
      >
        {t.officeLife.buildGhost.nextSlot}
      </text>
    </g>
  );
}
