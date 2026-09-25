import { useEffect } from "react";
import { FloatingTextTone, useGameStore } from "../../store/useGameStore";

const TONE_STYLES: Record<FloatingTextTone, string> = {
  danger: "text-rose-600 border-rose-200 bg-rose-50",
  success: "text-emerald-600 border-emerald-200 bg-emerald-50",
  warning: "text-amber-600 border-amber-200 bg-amber-50",
  info: "text-sky-600 border-sky-200 bg-sky-50",
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
          className={`font-bold text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-md border shadow-sm animate-combat-text-pop ${TONE_STYLES[t.tone]}`}
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
