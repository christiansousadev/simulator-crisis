import { Gavel } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateDilemma } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playDilemmaChime } from "../../utils/sound";

// signed value pill: green for a favorable delta, rose for an unfavorable one
function ImpactPill({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const favorable = invert ? value < 0 : value > 0;
  const tone = value === 0 ? "text-slate-400 bg-slate-100" : favorable ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tone}`}>
      {label}: {sign}
      {value}
    </span>
  );
}

// cinematic change advisory board decision card with a server-authoritative countdown
export default function CABDilemmaModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const rawDilemma = useGameStore((s) => s.activeDilemma);
  // memoized on the raw dilemma + language, not recomputed (and not a new object) on every
  // tick-driven re-render, so the chime/reset effect below never mistakes a re-render for a
  // genuinely new dilemma
  const dilemma = useMemo(() => (rawDilemma ? translateDilemma(rawDilemma, language) : null), [rawDilemma, language]);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const tickRateSeconds = useGameStore((s) => s.telemetry.tick_rate_seconds);
  const [resolving, setResolving] = useState(false);
  const lastDilemmaId = useRef<string | null>(null);

  useEffect(() => {
    if (dilemma && dilemma.dilemma_id !== lastDilemmaId.current) {
      lastDilemmaId.current = dilemma.dilemma_id;
      setResolving(false);
      playDilemmaChime();
    }
  }, [dilemma?.dilemma_id]);

  if (!dilemma) return null;

  const ticksRemaining = Math.max(0, dilemma.expires_at_tick - currentTick);
  const secondsRemaining = Math.round(ticksRemaining * tickRateSeconds);

  const handleChoice = async (choiceId: string) => {
    setResolving(true);
    try {
      await api.resolveDilemma(dilemma.dilemma_id, choiceId);
    } catch {
      // best-effort; the next telemetry frame or dilemma expiry reconciles actual engine state
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in">
      <div className="w-full max-w-xl rounded-xl border-2 border-rose-500/40 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden animate-modal-in">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60">
          <div className="flex items-center gap-2 text-sm font-bold font-heading text-slate-100">
            <Gavel className="w-4 h-4 text-rose-400" />
            {t.cabDilemma.modalTitle}
          </div>
          <span className="text-xs font-bold tabular-nums text-rose-300">
            {t.cabDilemma.timeRemaining(secondsRemaining)}
          </span>
        </div>

        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-white mb-2">{dilemma.title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{dilemma.narrative}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-5 pb-5">
          {dilemma.choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => handleChoice(choice.id)}
              disabled={resolving}
              className="text-left rounded-lg border border-slate-700 bg-slate-800 p-3 hover:bg-slate-750 hover:border-rose-400/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-sm font-bold text-white mb-2">{choice.label}</div>
              <div className="flex flex-wrap gap-1">
                <ImpactPill label={t.cabDilemma.choiceImpact.budget} value={choice.budget_delta} />
                <ImpactPill label={t.cabDilemma.choiceImpact.techDebt} value={choice.tech_debt_delta} invert />
                <ImpactPill label={t.cabDilemma.choiceImpact.morale} value={choice.happiness_delta} />
                <ImpactPill label={t.cabDilemma.choiceImpact.reputation} value={choice.reputation_delta} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
