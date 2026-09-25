import { Award, Globe2, Skull, Trophy, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { CareerRecord } from "../../types/game";
import { playClickSound } from "../../utils/sound";
import Spinner from "../common/Spinner";

type LeaderboardScope = "mine" | "global";

// PERMANENT CAREER LEADERBOARD, SURVIVES EVERY SESSION RESET FOR THIS BROWSER'S PLAYER ID
// SCOPED EITHER TO THIS BROWSER'S OWN RUNS OR THE FULL CROSS-PLAYER SERVER LEADERBOARD
export default function HallOfFameModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.hallOfFameOpen);
  const close = useGameStore((s) => s.closeHallOfFame);
  const [scope, setScope] = useState<LeaderboardScope>("mine");
  const [records, setRecords] = useState<CareerRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const fetcher = scope === "global" ? api.getGlobalCareerRecords : api.getCareerRecords;
    fetcher()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [open, scope]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in" onClick={close}>
      <div
        className="w-full max-w-lg max-h-[75vh] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60 shrink-0">
          <h2 className="text-sm font-bold font-heading text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            {t.titleScreen.hallOfFame}
          </h2>
          <button onClick={close} className="text-slate-400 hover:text-slate-100" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1.5 px-4 pt-3 shrink-0">
          {(["mine", "global"] as LeaderboardScope[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                playClickSound();
                setScope(s);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                scope === s ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {s === "mine" ? <User className="w-3.5 h-3.5" /> : <Globe2 className="w-3.5 h-3.5" />}
              {s === "mine" ? t.hallOfFame.myRecords : t.hallOfFame.global}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <Spinner />}
          {!loading && records.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
              <Trophy className="w-7 h-7 text-slate-700" />
              <p className="text-xs text-slate-500 max-w-[220px]">{t.hallOfFame.empty}</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {records.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-800 bg-slate-800/40">
                <span className="text-xs font-mono text-slate-500 w-5 shrink-0">#{i + 1}</span>
                {r.outcome === "victory" ? (
                  <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Skull className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">
                    {r.scenario_id ?? t.hallOfFame.sandbox} — {t.hallOfFame.daysSurvived(r.days_survived)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    SLA {r.final_sla_percentage.toFixed(2)}% · ${r.final_budget.toLocaleString()}
                    {scope === "global" ? ` · ${t.hallOfFame.anonymousPlayer(r.player_id.slice(0, 6))}` : ""}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-amber-400 shrink-0">+{r.prestige_earned}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
