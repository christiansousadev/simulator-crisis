import { useEffect, useState } from "react";
import { useRedAlert } from "../../hooks/useRedAlert";
import BoardroomMetricsDisplay from "./BoardroomMetricsDisplay";
import { GroundShadow } from "./OfficeProps";
import IsoBox from "./IsoBox";
import OfficeWorker from "./OfficeWorker";

interface BoardRoomProps {
  originX: number;
  originY: number;
}

// how long the executives take to cross the room; they sit back down only once they have arrived
const EXEC_WALK_MS = 1400;

// EXECUTIVE BOARDROOM WITH A LARGE CONFERENCE TABLE, LEATHER CHAIRS AND A LIVE METRICS TV
export default function BoardRoom({ originX, originY }: BoardRoomProps) {
  // on red alert the executives get up and stand at the metrics tv
  const redAlert = useRedAlert();
  const [seatedBack, setSeatedBack] = useState(!redAlert);
  useEffect(() => {
    if (redAlert) {
      setSeatedBack(false);
      return;
    }
    const timer = setTimeout(() => setSeatedBack(true), EXEC_WALK_MS);
    return () => clearTimeout(timer);
  }, [redAlert]);

  return (
    <g>
      {/* rolling whiteboard, set back in the near corner */}
      <IsoBox x={originX + 0.15} y={originY + 1.55} z={0.02} w={0.5} d={0.05} h={0.45} color="#f8fafc" stroke="rgba(15,23,42,0.35)" />
      <IsoBox x={originX + 0.15} y={originY + 1.55} z={0} w={0.5} d={0.05} h={0.02} color="#1e293b" />

      {/* wall-mounted live metrics tv: p99 latency, throughput and error-rate sparklines */}
      <BoardroomMetricsDisplay x={originX + 3.0} y={originY + 0.05} z={0.55} hasP1={redAlert} />

      <GroundShadow x={originX + 1.5} y={originY + 1.05} rx={34} ry={16} />

      {/* large conference table with an inlaid connectivity strip */}
      <IsoBox x={originX + 0.5} y={originY + 0.65} z={0.02} w={1.9} d={0.7} h={0.22} color="#5c3a21" />
      <IsoBox x={originX + 0.6} y={originY + 0.95} z={0.24} w={1.7} d={0.1} h={0.01} color="#38bdf8" />

      {/* leather executive chairs around the table */}
      <IsoBox x={originX + 0.4} y={originY + 1.45} z={0} w={0.24} d={0.24} h={0.32} color="#1c1917" topFactor={1.3} />
      <IsoBox x={originX + 1.1} y={originY + 1.45} z={0} w={0.24} d={0.24} h={0.32} color="#1c1917" topFactor={1.3} />
      <IsoBox x={originX + 1.8} y={originY + 1.45} z={0} w={0.24} d={0.24} h={0.32} color="#1c1917" topFactor={1.3} />
      <IsoBox x={originX + 2.5} y={originY + 0.55} z={0} w={0.24} d={0.24} h={0.32} color="#1c1917" topFactor={1.3} />

      <OfficeWorker
        x={redAlert ? originX + 2.95 : originX + 0.52}
        y={redAlert ? originY + 0.75 : originY + 1.35}
        z={redAlert || !seatedBack ? 0 : 0.24}
        shirtColor="#1f2937"
        hairColor="#1c1917"
        role="executive"
        seated={!redAlert && seatedBack}
        facing="right"
        transitionMs={EXEC_WALK_MS}
        mood="idle"
      />
      <OfficeWorker
        x={redAlert ? originX + 3.3 : originX + 1.22}
        y={redAlert ? originY + 0.95 : originY + 1.35}
        z={redAlert || !seatedBack ? 0 : 0.24}
        shirtColor="#374151"
        hairColor="#4a2e19"
        role="executive"
        seated={!redAlert && seatedBack}
        facing="right"
        transitionMs={EXEC_WALK_MS}
        mood="idle"
      />

      {/* standing visitor with a briefcase */}
      <OfficeWorker x={originX + 1.7} y={originY + 1.5} shirtColor="#111827" hairColor="#1c1917" role="executive" mood="idle" />
      <IsoBox x={originX + 1.85} y={originY + 1.55} z={0} w={0.18} d={0.1} h={0.14} color="#78350f" />
    </g>
  );
}
