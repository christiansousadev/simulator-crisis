import { useEffect, useState } from "react";
import OfficeWorker, { WorkerMood, WorkerRole } from "./OfficeWorker";
import { findPath, GraphNode, OFFICE_GRAPH } from "./waypointGraph";

interface PathfindingEmployeeProps {
  currentNodeId: string;
  targetNodeId: string;
  shirtColor: string;
  hairColor: string;
  hopDurationMs?: number;
  mood?: WorkerMood;
  holdsMug?: boolean;
  role?: WorkerRole;
  name?: string;
  workerStatusText?: string;
  onArrived?: () => void;
}

// WALKS A SPRITE HOP-BY-HOP ALONG A CORRIDOR-CONSTRAINED A* PATH, NEVER CLIPPING THROUGH DESKS
export default function PathfindingEmployee({
  currentNodeId,
  targetNodeId,
  shirtColor,
  hairColor,
  hopDurationMs = 900,
  mood = "running",
  holdsMug = false,
  role = "engineer",
  name,
  workerStatusText,
  onArrived,
}: PathfindingEmployeeProps) {
  const [path, setPath] = useState<GraphNode[]>([]);
  const [hopIndex, setHopIndex] = useState(0);

  useEffect(() => {
    setPath(findPath(OFFICE_GRAPH, currentNodeId, targetNodeId));
    setHopIndex(0);
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

  const nextNode = path[hopIndex + 1];
  let facing: "left" | "right" | undefined;
  if (nextNode) {
    facing = (nextNode.x - nextNode.y) < (node.x - node.y) ? "left" : "right";
  }

  const isAtDestination = hopIndex >= path.length - 1;
  const currentMood: WorkerMood = isAtDestination ? mood : "running";

  return (
    <OfficeWorker
      x={node.x}
      y={node.y}
      shirtColor={shirtColor}
      hairColor={hairColor}
      mood={currentMood}
      holdsMug={holdsMug}
      role={role}
      name={name}
      workerStatusText={workerStatusText}
      facing={facing}
      transitionMs={hopDurationMs}
    />
  );
}

