import { useEffect, useState } from "react";
import OfficeWorker, { WorkerMood } from "./OfficeWorker";
import { findPath, GraphNode, OFFICE_GRAPH } from "./waypointGraph";

interface PathfindingEmployeeProps {
  currentNodeId: string;
  targetNodeId: string;
  shirtColor: string;
  hairColor: string;
  hopDurationMs?: number;
  onArrived?: () => void;
}

// WALKS A SPRITE HOP-BY-HOP ALONG A CORRIDOR-CONSTRAINED A* PATH, NEVER CLIPPING THROUGH DESKS
export default function PathfindingEmployee({
  currentNodeId,
  targetNodeId,
  shirtColor,
  hairColor,
  hopDurationMs = 900,
  onArrived,
}: PathfindingEmployeeProps) {
  const [path, setPath] = useState<GraphNode[]>([]);
  const [hopIndex, setHopIndex] = useState(0);

  useEffect(() => {
    setPath(findPath(OFFICE_GRAPH, currentNodeId, targetNodeId));
    setHopIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId, targetNodeId]);

  useEffect(() => {
    if (path.length === 0 || hopIndex >= path.length - 1) {
      if (path.length > 0) onArrived?.();
      return;
    }
    const timer = setTimeout(() => setHopIndex((i) => i + 1), hopDurationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hopIndex, path, hopDurationMs]);

  const fallback = OFFICE_GRAPH.nodes.get(currentNodeId);
  const node = path[hopIndex] ?? fallback;
  if (!node) return null;

  const mood: WorkerMood = "running";

  return (
    <OfficeWorker x={node.x} y={node.y} shirtColor={shirtColor} hairColor={hairColor} mood={mood} transitionMs={hopDurationMs} />
  );
}
