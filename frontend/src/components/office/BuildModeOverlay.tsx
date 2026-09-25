import { Database, Layers, Shuffle, X, Zap } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { InfrastructureNodeType } from "../../types/game";

interface BuildModeOverlayProps {
  armedNodeType: InfrastructureNodeType | null;
  pendingTargetId: string | null;
  onArm: (nodeType: InfrastructureNodeType) => void;
  onCancel: () => void;
}

const CATALOG: { nodeType: InfrastructureNodeType; cost: number; icon: typeof Database; requiresProducer: boolean }[] = [
  { nodeType: "redis_cache", cost: 12000, icon: Zap, requiresProducer: false },
  { nodeType: "kafka_queue", cost: 20000, icon: Shuffle, requiresProducer: true },
  { nodeType: "db_read_replica", cost: 16000, icon: Database, requiresProducer: false },
  { nodeType: "nginx_lb", cost: 9000, icon: Layers, requiresProducer: false },
];

// SCREEN-SPACE PALETTE STRIP FOR THE SERVER ROOM BUILD-MODE OVERLAY
export default function BuildModeOverlay({ armedNodeType, pendingTargetId, onArm, onCancel }: BuildModeOverlayProps) {
  const t = useTranslation();

  return (
    <div className="absolute top-3 right-3 z-30 flex flex-col gap-2 items-end">
      <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 p-1.5">
        {CATALOG.map((entry) => {
          const Icon = entry.icon;
          const armed = armedNodeType === entry.nodeType;
          return (
            <button
              key={entry.nodeType}
              onClick={() => onArm(entry.nodeType)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-md text-[9px] font-bold transition-colors ${
                armed ? "bg-sky-500/30 text-sky-300 border border-sky-400" : "text-slate-300 hover:bg-slate-700 border border-transparent"
              }`}
              title={t.buildMode.catalog[entry.nodeType].name}
            >
              <Icon className="w-4 h-4" />
              ${(entry.cost / 1000).toFixed(0)}k
            </button>
          );
        })}
      </div>
      {armedNodeType && (
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur rounded-lg border border-sky-500/40 px-3 py-1.5 text-[11px] text-sky-200">
          {pendingTargetId ? t.buildMode.selectProducerHint : t.buildMode.selectTargetHint}
          <button onClick={onCancel} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
