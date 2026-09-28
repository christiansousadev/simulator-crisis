import { useEffect } from "react";
import { FloatingTextTone, useGameStore } from "../../store/useGameStore";

// arcade combat-text look: dark glass chip per tone, colored glow standing in for a crt bloom
const TONE_STYLES: Record<FloatingTextTone, string> = {
  danger: "bg-slate-950/85 border-rose-500/60 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)]",
  warning: "bg-slate-950/85 border-amber-500/60 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]",
  success: "bg-slate-950/85 border-emerald-500/60 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]",
  info: "bg-slate-950/85 border-sky-500/60 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.4)]",
  gold: "bg-slate-950/85 border-yellow-400/70 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.5)]",
};

const AUTO_DISMISS_MS = 1600;

// floating combat-text ticker: brief callouts for spawns, resolutions and penalties
export default function FloatingCombatText() {
  const texts = useGameStore((s) => s.floatingTexts);
  const dismiss = useGameStore((s) => s.dismissFloatingText);

  useEffect(() => {
    const timers = texts.map((t) => setTimeout(() => dismiss(t.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [texts, dismiss]);

  if (texts.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-50 flex flex-col items-end gap-1.5 pointer-events-none max-w-xs">
      {texts.map((t) => (
        <span
          key={t.id}
          data-testid="floating-text"
          data-tone={t.tone}
          className={`font-mono font-black text-xs uppercase tracking-wider px-3 py-1.5 rounded border animate-combat-text-pop ${TONE_STYLES[t.tone]}`}
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
