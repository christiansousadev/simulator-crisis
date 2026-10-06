import { ArrowDown, ArrowUp } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

interface DeltaTagProps {
  /** current absolute value being tracked -- the tag reacts to its movement, not to a passed-in delta */
  value: number;
  /** formats the per-tick rate for the tooltip, e.g. (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%` */
  format?: (rate: number) => string;
  /** ignores drift smaller than this per-tick magnitude (float jitter, sub-unit noise) */
  threshold?: number;
  /** flips color semantics for metrics where a rising value is the bad direction (e.g. tech debt) */
  invert?: boolean;
  className?: string;
}

const SAMPLES = 4;
// how long after the last movement the arrow lingers before it settles
const LINGER_MS = 3000;
const DEFAULT_FORMAT = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

// CALM TREND ARROW NEXT TO A METER. It averages the last few changes into a per-tick direction and
// shows it in a fixed-width slot, so it does not pop in and out, restart an animation or shift the
// layout every tick (the old floating pill did all three because the passive burn changes cash on
// every single tick). The slot is always reserved; only the arrow inside it comes and goes.
export default memo(function DeltaTag({ value, format = DEFAULT_FORMAT, threshold = 0, invert = false, className = "" }: DeltaTagProps) {
  const history = useRef<number[]>([value]);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const h = history.current;
    if (h[h.length - 1] === value) return;
    h.push(value);
    if (h.length > SAMPLES) h.shift();
    const perTick = (h[h.length - 1] - h[0]) / (h.length - 1);
    setRate(Math.abs(perTick) > threshold ? perTick : 0);
    // no movement for a while: let the arrow settle instead of claiming a trend forever
    const timer = setTimeout(() => {
      history.current = [value];
      setRate(0);
    }, LINGER_MS);
    return () => clearTimeout(timer);
  }, [value, threshold]);

  const good = invert ? rate < 0 : rate > 0;
  const Icon = rate > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${className}`}
      title={rate !== 0 ? format(rate) : undefined}
    >
      {rate !== 0 && <Icon className={`h-3 w-3 ${good ? "text-emerald-400" : "text-rose-400"}`} aria-label={format(rate)} />}
    </span>
  );
});
