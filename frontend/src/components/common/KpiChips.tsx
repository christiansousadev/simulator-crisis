import { memo, useEffect, useMemo } from "react";
import { useGameStore } from "../../store/useGameStore";
import { KpiId } from "../../utils/kpiBands";
import { formatKpiChip, KPI_CHIP_LIFETIME_MS, KpiEvent, kpiEventIsGood } from "../../utils/kpiEvents";

// one sweep loop for the whole app: chips are plain store rows, and a chip whose meter is not
// mounted (e.g. a closed popover) would otherwise never be dismissed
let reaperStarted = false;
function ensureKpiReaper() {
  if (reaperStarted) return;
  reaperStarted = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sweep = () => {
    timer = null;
    const { kpiEvents, dismissKpiEvent } = useGameStore.getState();
    const now = Date.now();
    for (const e of kpiEvents) if (now - e.updatedAt > KPI_CHIP_LIFETIME_MS + 100) dismissKpiEvent(e.id);
    if (useGameStore.getState().kpiEvents.length > 0) timer = setTimeout(sweep, 300);
  };
  useGameStore.subscribe((state, prev) => {
    if (state.kpiEvents !== prev.kpiEvents && state.kpiEvents.length > 0 && timer === null) {
      timer = setTimeout(sweep, 300);
    }
  });
}

const GOOD = "border-emerald-500/50 text-emerald-300";
const BAD = "border-rose-500/50 text-rose-300";

const Chip = memo(function Chip({ event }: { event: KpiEvent }) {
  const good = kpiEventIsGood(event.kpi, event.amount);
  return (
    <span
      className={`inline-flex w-max items-center whitespace-nowrap rounded border bg-slate-950/95 px-1.5 py-0.5 text-caption font-bold tabular-nums shadow-lg animate-kpi-chip-fly ${
        good ? GOOD : BAD
      }`}
    >
      {formatKpiChip(event)}
    </span>
  );
});

interface KpiChipsProps {
  kpi: KpiId;
  className?: string;
}

// LABELLED CHANGE CHIPS ("-$1,800 · Rollback") THAT FLY OFF THE METER THEY BELONG TO. Purely
// visual (aria-hidden): the same information is announced through the toast live region.
export default memo(function KpiChips({ kpi, className = "" }: KpiChipsProps) {
  const events = useGameStore((s) => s.kpiEvents);
  const mine = useMemo(() => events.filter((e) => e.kpi === kpi), [events, kpi]);

  useEffect(() => {
    ensureKpiReaper();
  }, []);

  if (mine.length === 0) return null;
  return (
    <div aria-hidden className={`pointer-events-none z-hud flex flex-col gap-1 ${className}`}>
      {mine.map((e) => (
        // keyed on rev so a merge restarts the fly animation with the new total
        <Chip key={`${e.id}:${e.rev}`} event={e} />
      ))}
    </div>
  );
});
