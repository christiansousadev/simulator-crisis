import { Film, Pause, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { AuditLogEntry } from "../../types/game";

const PLAYBACK_INTERVAL_MS = 700;

// FAST-FORWARD REPLAY OF EVERY LEDGER EVENT CORRELATED TO ONE INCIDENT, SCRUBBED TICK BY TICK
export default function IncidentReplayModal() {
  const t = useTranslation();
  const incidentId = useGameStore((s) => s.replayIncidentId);
  const close = useGameStore((s) => s.closeIncidentReplay);
  const [allAudits, setAllAudits] = useState<AuditLogEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);

  useEffect(() => {
    if (!incidentId) return;
    setVisibleCount(1);
    setPlaying(true);
    api
      .getAllAudits()
      .then(setAllAudits)
      .catch(() => setAllAudits([]));
  }, [incidentId]);

  // correlate ledger rows to this incident the same way the backend's postmortem query does:
  // a substring match against the serialized details payload
  const events = useMemo(() => {
    if (!incidentId) return [];
    return allAudits
      .filter((entry) => JSON.stringify(entry.details).includes(incidentId))
      .sort((a, b) => a.tick - b.tick);
  }, [allAudits, incidentId]);

  useEffect(() => {
    if (!playing || visibleCount >= events.length) {
      if (visibleCount >= events.length) setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setVisibleCount((v) => v + 1), PLAYBACK_INTERVAL_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, visibleCount, events.length, speed]);

  if (!incidentId) return null;

  const visibleEvents = events.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={close}>
      <div
        className="w-full max-w-lg max-h-[75vh] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60 shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Film className="w-4 h-4 text-sky-400" />
            {t.incidentReplay.title(incidentId)}
          </h2>
          <button onClick={close} className="text-slate-400 hover:text-slate-100" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5">
          {events.length === 0 && <p className="text-center text-xs text-slate-500 py-8">{t.incidentReplay.empty}</p>}
          {visibleEvents.map((event) => (
            <div
              key={event.id}
              className={`px-3 py-2 rounded-lg border-l-2 text-[11px] font-mono animate-pop-in ${
                event.compliance_flag ? "border-emerald-500 bg-emerald-500/5 text-emerald-200" : "border-rose-500 bg-rose-500/5 text-rose-200"
              }`}
            >
              <span className="text-slate-500 mr-2">T+{event.tick}</span>
              <span className="font-bold">{event.event_type}</span>
              <span className="text-slate-500 ml-2">({event.actor})</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700 shrink-0">
          <button
            onClick={() => setPlaying((p) => !p)}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-xs font-bold transition-colors"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? t.incidentReplay.pause : t.incidentReplay.play}
          </button>
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${events.length ? (visibleCount / events.length) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center gap-1">
            {([1, 2] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${speed === s ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-800"}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
