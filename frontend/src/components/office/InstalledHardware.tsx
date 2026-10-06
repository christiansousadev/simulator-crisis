import { Trash2 } from "lucide-react";
import { KeyboardEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import { usePendingAction, runExclusive } from "../../hooks/useAsyncAction";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { InfrastructureNodeType } from "../../types/game";
import { nodeCost, nodesForService, PlacedNodeView } from "../../utils/infraNodes";
import { playClickSound, playErrorSound, playUiBackSound } from "../../utils/sound";

const removeKey = (nodeId: string) => `remove-node:${nodeId}`;

interface RowProps {
  view: PlacedNodeView;
}

// ONE PLACED MODULE WITH ITS TWO-STEP REMOVAL: Remove -> "No refund. Remove?" Confirm / Cancel.
// Escape cancels the question; focus lands on Cancel so a stray Enter can never destroy hardware.
const NodeRow = memo(function NodeRow({ view }: RowProps) {
  const t = useTranslation();
  const { node, role } = view;
  const [asking, setAsking] = useState(false);
  const pending = usePendingAction(removeKey(node.id));
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const name = t.buildMode.catalog[node.node_type as InfrastructureNodeType]?.name ?? node.node_type;

  useEffect(() => {
    if (asking) cancelRef.current?.focus();
  }, [asking]);

  const cancel = () => {
    playUiBackSound();
    setAsking(false);
    // hand focus back to the button that opened the question
    queueMicrotask(() => removeRef.current?.focus());
  };

  const confirm = () => {
    playClickSound();
    const store = useGameStore.getState();
    void runExclusive(removeKey(node.id), () => api.removeInfrastructureNode(node.id), {
      confirmed: (s) => !s.telemetry.infrastructure_nodes.some((n) => n.id === node.id),
      onSuccess: () => {
        setAsking(false);
        store.pushFloatingText(t.uiGaps.nodes.removed(name), "success");
        // a paused simulation broadcasts no tick, so pull the snapshot to drop the node from the list
        if (!useGameStore.getState().telemetry.is_running) {
          api.getState().then((frame) => useGameStore.getState().setTelemetry(frame)).catch(() => {});
        }
      },
      onError: (err) => {
        playErrorSound();
        setAsking(false);
        store.pushFloatingText(err instanceof Error && err.message ? err.message : t.uiGaps.nodes.removeFailed, "danger");
      },
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (asking && e.key === "Escape") {
      e.stopPropagation();
      cancel();
    }
  };

  return (
    <li onKeyDown={onKeyDown} data-testid="placed-node" data-node-id={node.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-100">{name}</p>
          <p className="text-[10px] text-slate-400">
            {t.uiGaps.nodes.paid(`$${nodeCost(node.node_type).toLocaleString()}`)}
            {role === "producer" ? ` · ${t.uiGaps.nodes.asProducer}` : ""}
          </p>
        </div>
        {!asking && (
          <button
            ref={removeRef}
            type="button"
            onClick={() => setAsking(true)}
            disabled={pending}
            aria-label={t.uiGaps.nodes.removeAria(name)}
            className="flex shrink-0 items-center gap-1 rounded border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 transition-colors hover:bg-rose-950/50 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            {pending ? t.uiGaps.nodes.removing : t.uiGaps.nodes.remove}
          </button>
        )}
      </div>
      {asking && (
        <div role="alertdialog" aria-label={t.uiGaps.nodes.removeAria(name)} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 flex-1 text-[11px] font-semibold text-amber-300">{t.uiGaps.nodes.confirmPrompt}</span>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded border border-rose-500/60 bg-rose-950/60 px-2 py-0.5 text-[10px] font-bold text-rose-200 hover:bg-rose-900/60 disabled:opacity-50"
          >
            {t.uiGaps.nodes.confirm}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            className="rounded border border-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-800"
          >
            {t.uiGaps.nodes.cancel}
          </button>
        </div>
      )}
    </li>
  );
});

// THE INFRASTRUCTURE MODULES ATTACHED TO THE INSPECTED SERVICE, EACH WITH A REMOVE CONTROL.
// Renders nothing when the service has no placed hardware.
export default function InstalledHardware({ serviceId }: { serviceId: string }) {
  const t = useTranslation();
  const nodes = useGameStore((s) => s.telemetry.infrastructure_nodes);
  const views = useMemo(() => nodesForService(nodes, serviceId), [nodes, serviceId]);
  if (views.length === 0) return null;
  return (
    <div className="border-t border-slate-700/60 pt-2" data-testid="installed-hardware">
      <span className="uppercase tracking-wide text-slate-500" style={{ fontSize: 10 }}>
        {t.uiGaps.nodes.heading}
      </span>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {views.map((view) => (
          <NodeRow key={view.node.id} view={view} />
        ))}
      </ul>
    </div>
  );
}
