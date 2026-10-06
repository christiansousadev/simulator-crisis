import { Trophy } from "lucide-react";
import { useEffect } from "react";
import { usePresence } from "../../hooks/usePresence";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

const AUTO_DISMISS_MS = 5000;
const EXIT_MS = 220;

// CELEBRATORY GOLD TOAST FOR A NEWLY UNLOCKED CAREER ACHIEVEMENT. Sits top-centre, clear of the
// objective tracker and incident alerts in the top-right and the camera controls in the top-left,
// and the combat-text stack that lives above the dock.
export default function AchievementToast() {
  const t = useTranslation();
  const toast = useGameStore((s) => s.achievementToast);
  const dismiss = useGameStore((s) => s.dismissAchievementToast);
  const { data, mounted, closing } = usePresence(toast, EXIT_MS);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!mounted || !data) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-toast flex justify-center px-4">
      <button
        type="button"
        role="status"
        aria-live="polite"
        onClick={dismiss}
        className={`pointer-events-auto flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-slate-900 px-4 py-3 text-left shadow-2xl ${
          closing ? "animate-item-out" : "animate-pop-in"
        }`}
      >
        <span className="rounded-full bg-amber-400/20 p-2 text-amber-300">
          <Trophy className="h-5 w-5" aria-hidden />
        </span>
        <span className="block">
          <span className="block font-heading text-xs font-bold uppercase tracking-wider text-amber-300">{t.achievements.unlockedToast}</span>
          <span className="block text-sm font-bold text-white">{data.name}</span>
          <span className="block text-caption text-slate-400">
            +{data.prestigePoints} {t.achievements.prestigePoints}
          </span>
        </span>
      </button>
    </div>
  );
}
