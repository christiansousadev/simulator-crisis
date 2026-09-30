import { useEffect, useRef, useState } from "react";

interface DeltaTagProps {
  /** current absolute value being tracked -- the tag reacts to changes in this, not to a passed-in delta */
  value: number;
  /** formats the signed delta magnitude into display text, e.g. (n) => `${n > 0 ? "+" : ""}${n}%` */
  format?: (delta: number) => string;
  /** ignores changes smaller than this magnitude (float jitter, sub-unit drift) */
  threshold?: number;
  /** flips color semantics for metrics where a rising value is the bad direction (e.g. tech debt) */
  invert?: boolean;
  className?: string;
}

const VISIBLE_MS = 2000;
const DEFAULT_FORMAT = (n: number) => `${n > 0 ? "+" : ""}${n}`;

// compact floating delta pill: appears beside a meter for a couple seconds right after its
// value changes, then fades -- self-contained (tracks its own previous value via a ref), no
// global state, no continuous timer; reuses the existing float-up-fade keyframe
export default function DeltaTag({ value, format = DEFAULT_FORMAT, threshold = 0, invert = false, className = "" }: DeltaTagProps) {
  const prevRef = useRef(value);
  const seqRef = useRef(0);
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);

  useEffect(() => {
    if (!Number.isFinite(value) || !Number.isFinite(prevRef.current)) {
      prevRef.current = Number.isFinite(value) ? value : 0;
      return;
    }
    const diff = value - prevRef.current;
    prevRef.current = value;
    if (!Number.isFinite(diff) || Math.abs(diff) <= threshold || diff === 0) return;

    seqRef.current += 1;
    const key = seqRef.current;
    setDelta({ amount: diff, key });
    const timer = setTimeout(() => setDelta((cur) => (cur?.key === key ? null : cur)), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [value, threshold]);

  if (!delta) return null;
  const positive = invert ? delta.amount < 0 : delta.amount > 0;

  return (
    <span
      key={delta.key}
      className={`pointer-events-none absolute font-mono font-bold text-[11px] tabular-nums whitespace-nowrap animate-float-up-fade ${
        positive ? "text-emerald-400" : "text-rose-400"
      } ${className}`}
    >
      {format(delta.amount)}
    </span>
  );
}
