import { Trophy } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

const AUTO_DISMISS_MS = 5000;

// CELEBRATORY GOLD TOAST FOR A NEWLY UNLOCKED CAREER ACHIEVEMENT
export default function AchievementToast() {
  const t = useTranslation();
  const toast = useGameStore((s) => s.achievementToast);
  const dismiss = useGameStore((s) => s.dismissAchievementToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className="fixed top-20 right-5 z-[95] animate-pop-in">
      <div
        onClick={dismiss}
        className="cursor-pointer flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-amber-400 bg-slate-900 shadow-2xl"
      >
        <div className="p-2 rounded-full bg-amber-400/20 text-amber-300">
          <Trophy className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">{t.achievements.unlockedToast}</p>
          <p className="text-sm font-bold text-white">{toast.name}</p>
          <p className="text-[11px] text-slate-400">+{toast.prestigePoints} {t.achievements.prestigePoints}</p>
        </div>
      </div>
    </div>
  );
}
