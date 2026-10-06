import { Gift, Lock, Trophy } from "lucide-react";
import { memo } from "react";
import { achievementCatalog, cosmeticCatalog, useCatalog } from "../../hooks/useCatalogs";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { AchievementCatalogEntry } from "../../types/game";
import { playCashSound, playClickSound, playErrorSound } from "../../utils/sound";
import EmptyState from "../common/EmptyState";
import Spinner from "../common/Spinner";
import TransitionList from "../common/TransitionList";

const AchievementCard = memo(function AchievementCard({ entry, unlocked }: { entry: AchievementCatalogEntry; unlocked: boolean }) {
  const t = useTranslation();
  return (
    <div
      title={entry.description}
      className={`flex h-full flex-col gap-0.5 rounded-lg border p-2 transition-colors duration-slow ${
        unlocked ? "border-amber-500/40 bg-amber-950/20" : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="flex items-center gap-1">
        {unlocked ? (
          <Trophy className="h-3 w-3 shrink-0 text-amber-300" aria-label={t.hud.achievements.unlocked} />
        ) : (
          <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label={t.hud.achievements.locked} />
        )}
        <span className={`truncate text-caption font-bold ${unlocked ? "text-slate-100" : "text-slate-300"}`}>{entry.name}</span>
      </div>
      <span className="line-clamp-2 text-micro leading-tight text-slate-300">{entry.description}</span>
      <span className={`text-micro font-bold ${unlocked ? "text-amber-300" : "text-slate-400"}`}>{t.hud.achievements.points(entry.prestige_points)}</span>
    </div>
  );
});

// CAREER PROGRESSION TAB: ACHIEVEMENT CATALOG PLUS THE PRESTIGE-POINT COSMETIC SHOP. The catalogs
// come from a module-level cache (prefetched when the dock mounts), so reopening the tab never
// flashes an empty grid.
export default function AchievementsPanel() {
  const t = useTranslation();
  const unlocked = useGameStore((s) => s.telemetry.achievements_unlocked);
  const prestigePoints = useGameStore((s) => s.telemetry.prestige_points);
  const unlockedCosmetics = useGameStore((s) => s.telemetry.unlocked_cosmetics);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const achievements = useCatalog(achievementCatalog);
  const cosmetics = useCatalog(cosmeticCatalog);

  const handleUnlockCosmetic = async (cosmeticId: string) => {
    playClickSound();
    try {
      await api.unlockCosmetic(cosmeticId);
      playCashSound();
    } catch (err) {
      playErrorSound();
      pushFloatingText(err instanceof Error && err.message ? err.message : t.achievements.insufficientPrestige, "danger");
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-2">
        {!achievements.data ? (
          achievements.error ? (
            <EmptyState icon={Trophy} title={t.hud.achievements.loadFailed}>
              <button
                type="button"
                onClick={achievements.reload}
                className="rounded-md border border-slate-600 px-2.5 py-1 text-caption font-bold text-slate-200 transition-colors hover:bg-slate-800"
              >
                {t.hud.common.retry}
              </button>
            </EmptyState>
          ) : (
            <Spinner label={t.hud.achievements.loading} />
          )
        ) : achievements.data.length === 0 ? (
          <EmptyState icon={Trophy} title={t.hud.achievements.emptyTitle} hint={t.hud.achievements.emptyHint} />
        ) : (
          <TransitionList
            items={achievements.data}
            getKey={(a) => a.id}
            className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1.5"
          >
            {(entry) => <AchievementCard entry={entry} unlocked={unlocked.includes(entry.id)} />}
          </TransitionList>
        )}
      </div>

      <div className="flex w-52 shrink-0 flex-col gap-1.5 overflow-y-auto border-l border-slate-800 p-2">
        <div className="flex items-center justify-between font-heading text-xs font-bold uppercase tracking-wider text-slate-300">
          <span>{t.achievements.prestigePoints}</span>
          <span className="tabular-nums text-amber-300">{prestigePoints}</span>
        </div>
        <p className="font-heading text-micro font-semibold uppercase tracking-wider text-slate-400">{t.hud.achievements.cosmetics}</p>
        {!cosmetics.data && !cosmetics.error && <Spinner size="sm" label={t.hud.common.loading} />}
        {(cosmetics.data ?? []).map((c) => {
          const owned = unlockedCosmetics.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => handleUnlockCosmetic(c.id)}
              disabled={owned || prestigePoints < c.prestige_cost}
              className="flex items-center justify-between gap-1 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-left transition-colors hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-400"
            >
              <span className="flex min-w-0 items-center gap-1 truncate text-caption font-bold text-slate-100">
                <Gift className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
                {c.name}
              </span>
              <span className="shrink-0 text-micro font-bold text-amber-300">{owned ? t.achievements.owned : c.prestige_cost}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
