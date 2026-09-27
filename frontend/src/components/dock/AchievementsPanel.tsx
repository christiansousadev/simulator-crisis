import { Gift, Lock, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { AchievementCatalogEntry, CosmeticCatalogEntry } from "../../types/game";
import { playCashSound, playClickSound } from "../../utils/sound";

// CAREER PROGRESSION TAB: 12-ACHIEVEMENT CATALOG PLUS THE PRESTIGE-POINT COSMETIC SHOP
export default function AchievementsPanel() {
  const t = useTranslation();
  const unlocked = useGameStore((s) => s.telemetry.achievements_unlocked);
  const prestigePoints = useGameStore((s) => s.telemetry.prestige_points);
  const unlockedCosmetics = useGameStore((s) => s.telemetry.unlocked_cosmetics);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [catalog, setCatalog] = useState<AchievementCatalogEntry[]>([]);
  const [cosmetics, setCosmetics] = useState<CosmeticCatalogEntry[]>([]);

  useEffect(() => {
    api.getAchievementCatalog().then(setCatalog).catch(() => setCatalog([]));
    api.getCosmeticCatalog().then(setCosmetics).catch(() => setCosmetics([]));
  }, []);

  const handleUnlockCosmetic = async (cosmeticId: string) => {
    playClickSound();
    try {
      await api.unlockCosmetic(cosmeticId);
      playCashSound();
    } catch {
      pushFloatingText(t.achievements.insufficientPrestige, "danger");
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-3 lg:grid-cols-4 gap-1.5">
        {catalog.map((entry) => {
          const isUnlocked = unlocked.includes(entry.id);
          return (
            <div
              key={entry.id}
              className={`rounded-lg border p-2 flex flex-col gap-0.5 ${
                isUnlocked ? "border-amber-500/40 bg-amber-950/20" : "border-slate-800 bg-slate-900/60 opacity-60"
              }`}
              title={entry.description}
            >
              <div className="flex items-center gap-1">
                {isUnlocked ? <Trophy className="w-3 h-3 text-amber-400" /> : <Lock className="w-3 h-3 text-slate-500" />}
                <span className="text-[10px] font-bold text-slate-200 truncate">{entry.name}</span>
              </div>
              <span className="text-[9px] text-slate-400 leading-tight line-clamp-2">{entry.description}</span>
              <span className="text-[9px] font-bold text-amber-400">+{entry.prestige_points} pts</span>
            </div>
          );
        })}
      </div>

      <div className="w-48 border-l border-slate-800 p-2 flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wide">
          <span>{t.achievements.prestigePoints}</span>
          <span className="text-amber-400">{prestigePoints}</span>
        </div>
        {cosmetics.map((c) => {
          const owned = unlockedCosmetics.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => handleUnlockCosmetic(c.id)}
              disabled={owned || prestigePoints < c.prestige_cost}
              className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-md border border-slate-800 bg-slate-900/80 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800/80"
            >
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-200 truncate">
                <Gift className="w-3 h-3 text-slate-400 shrink-0" />
                {c.name}
              </span>
              <span className="text-[9px] font-bold text-amber-400 shrink-0">{owned ? t.achievements.owned : c.prestige_cost}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
