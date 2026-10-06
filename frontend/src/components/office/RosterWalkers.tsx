import { useShallow } from "zustand/react/shallow";
import PathfindingEmployee from "./PathfindingEmployee";
import type { WalkerBand } from "./rosterPlan";
import { useRosterStage } from "./rosterStage";

interface RosterWalkersProps {
  band: WalkerBand;
  onSelect?: (serviceId: string) => void;
}

// ONE PAINTER LAYER OF THE ROSTER. The scene paints back to front, so a walking sprite is rendered by
// whichever layer sits just behind its current spot (rosterStage hands it over between hops).
export default function RosterWalkers({ band, onSelect }: RosterWalkersProps) {
  const views = useRosterStage(useShallow((s) => s.walkers.filter((w) => w.band === band)));
  if (views.length === 0) return null;
  return (
    <g>
      {views.map((view) => (
        <PathfindingEmployee key={view.id} view={view} onSelect={onSelect} />
      ))}
    </g>
  );
}
