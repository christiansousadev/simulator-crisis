import { AlertOctagon, AlertTriangle, Award, CheckCircle2, Info, LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTranslation } from "../../i18n/useTranslation";
import { FloatingText, FloatingTextTone, useGameStore } from "../../store/useGameStore";

// arcade combat-text look: dark glass chip per tone, colored glow standing in for a crt bloom
const TONE_STYLES: Record<FloatingTextTone, string> = {
  danger: "bg-slate-950/90 border-rose-500/60 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.35)]",
  warning: "bg-slate-950/90 border-amber-500/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.35)]",
  success: "bg-slate-950/90 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.35)]",
  info: "bg-slate-950/90 border-sky-500/60 text-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.35)]",
  gold: "bg-slate-950/90 border-yellow-400/70 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.45)]",
};

const TONE_ICON: Record<FloatingTextTone, LucideIcon> = {
  danger: AlertOctagon,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  gold: Award,
};

// base on-screen time per tone: a failure must stay long enough to read (>= 3.5s)
const BASE_DWELL_MS: Record<FloatingTextTone, number> = {
  danger: 3500,
  warning: 2800,
  gold: 2800,
  success: 2200,
  info: 2000,
};
const EXIT_MS = 200;
const LONG_TEXT_CHARS = 32;

// longer messages (backend error text is shown verbatim) get extra reading time
export function dwellFor(tone: FloatingTextTone, text: string): number {
  const extra = Math.min(2500, Math.max(0, text.length - 24) * 45);
  return BASE_DWELL_MS[tone] + extra;
}

const Toast = memo(function Toast({
  item,
  paused,
  onDismiss,
  dismissLabel,
}: {
  item: FloatingText;
  paused: boolean;
  onDismiss: (id: string) => void;
  dismissLabel: string;
}) {
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(dwellFor(item.tone, item.text));
  const startedAt = useRef(0);
  const Icon = TONE_ICON[item.tone];

  // dwell timer that survives hover: pausing stores what is left, resuming restarts from it
  useEffect(() => {
    if (leaving || paused) return;
    startedAt.current = performance.now();
    const timer = setTimeout(() => {
      if (reduced) onDismiss(item.id);
      else setLeaving(true);
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(400, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, leaving, reduced, item.id, onDismiss]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onDismiss(item.id), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, item.id, onDismiss]);

  return (
    <button
      type="button"
      data-testid="floating-text"
      data-tone={item.tone}
      onClick={() => onDismiss(item.id)}
      aria-label={`${item.text} (${dismissLabel})`}
      className={`pointer-events-auto flex max-w-full items-center gap-2 rounded border px-3 py-1.5 text-left font-mono text-xs font-bold tracking-wide ${
        item.text.length > LONG_TEXT_CHARS ? "" : "uppercase tracking-wider"
      } ${TONE_STYLES[item.tone]} ${leaving ? "animate-item-out" : "animate-slide-up-in"}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{item.text}</span>
    </button>
  );
});

// ONE LAYOUT MANAGER FOR EVERY TRANSIENT CALLOUT. The stack sits centred just above the dock (the
// dock publishes its height as --dock-height), a spot no other overlay uses: the objective tracker,
// incident alerts and achievement toast live top-right/top-centre, camera controls and resolution
// cards top-left, the mini-map bottom-right. Newest is last in the DOM (closest to the dock),
// errors are never merged, hovering pauses every timer, and the region is a polite live region.
export default function FloatingCombatText() {
  const t = useTranslation();
  const texts = useGameStore((s) => s.floatingTexts);
  const dismiss = useGameStore((s) => s.dismissFloatingText);
  const [hovered, setHovered] = useState(false);
  const onDismiss = useCallback((id: string) => dismiss(id), [dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={t.hud.toast.region}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ bottom: "calc(var(--dock-height, 17.5rem) + 0.75rem)" }}
      className="pointer-events-none fixed left-1/2 z-toast flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-1.5"
    >
      {texts.map((item) => (
        <Toast key={item.id} item={item} paused={hovered} onDismiss={onDismiss} dismissLabel={t.hud.toast.dismiss} />
      ))}
    </div>
  );
}
