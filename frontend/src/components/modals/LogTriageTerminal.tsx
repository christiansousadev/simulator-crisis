import { Terminal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { LogLevel, LogLine } from "../../types/game";
import { playCashSound, playClickSound } from "../../utils/sound";

const LEVELS: LogLevel[] = ["INFO", "WARN", "ERROR", "FATAL"];
const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: "text-emerald-400",
  WARN: "text-amber-400",
  ERROR: "text-rose-400",
  FATAL: "text-rose-300 font-bold",
};

// DARK CRT-STYLE TERMINAL DRAWER FOR THE ROOT-CAUSE LOG TRIAGE MINI-GAME
export default function LogTriageTerminal() {
  const t = useTranslation();
  const incidentId = useGameStore((s) => s.triageIncidentId);
  const close = useGameStore((s) => s.closeTriageTerminal);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(new Set(LEVELS));
  const [solvedLineId, setSolvedLineId] = useState<string | null>(null);
  const [wrongLineId, setWrongLineId] = useState<string | null>(null);

  useEffect(() => {
    if (!incidentId) return;
    setLines([]);
    setSolvedLineId(null);
    setWrongLineId(null);
    api
      .getIncidentLogs(incidentId)
      .then((res) => setLines(res.lines))
      .catch(() => setLines([]));
  }, [incidentId]);

  if (!incidentId) return null;

  const toggleFilter = (level: LogLevel) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const handleLineClick = async (line: LogLine) => {
    if (solvedLineId) return;
    playClickSound();
    try {
      const result = await api.submitTriage(incidentId, line.id);
      if (result.correct) {
        setSolvedLineId(line.id);
        pushFloatingText(t.logTriage.rewardEarned, "success");
        playCashSound();
      } else {
        setWrongLineId(line.id);
        setTimeout(() => setWrongLineId(null), 500);
      }
    } catch {
      // best-effort; the terminal stays interactive on a network hiccup
    }
  };

  const visibleLines = lines.filter((l) => activeFilters.has(l.level));

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={close}>
      <div
        className="w-full max-w-2xl max-h-[75vh] rounded-lg border-2 border-emerald-500/40 bg-black shadow-2xl flex flex-col overflow-hidden font-mono"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundImage: "repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(34,197,94,0.03) 3px)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-500/30 bg-emerald-500/5 shrink-0">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <Terminal className="w-4 h-4" />
            {t.logTriage.title}
          </div>
          <button onClick={close} className="text-emerald-600 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-emerald-500/20 shrink-0">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleFilter(level)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                activeFilters.has(level) ? `${LEVEL_COLOR[level]} border-current` : "text-slate-600 border-slate-700"
              }`}
            >
              {level}
            </button>
          ))}
          {solvedLineId && (
            <span className="ml-auto text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
              {t.logTriage.rootCauseConfirmed}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 text-[11px] leading-relaxed">
          {visibleLines.map((line) => (
            <div
              key={line.id}
              onClick={() => handleLineClick(line)}
              className={`cursor-pointer px-1 py-0.5 rounded transition-colors ${
                line.id === solvedLineId
                  ? "bg-emerald-500/20 border border-emerald-400"
                  : line.id === wrongLineId
                    ? "bg-rose-500/20"
                    : "hover:bg-emerald-500/10"
              }`}
            >
              <span className="text-slate-600 mr-2">T+{line.tick_offset}</span>
              <span className={`mr-2 ${LEVEL_COLOR[line.level]}`}>[{line.level}]</span>
              <span className="text-slate-300">{line.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
