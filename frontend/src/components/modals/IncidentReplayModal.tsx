import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Film,
  Gavel,
  Pause,
  Play,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  Target,
  Users,
  Wrench,
  Zap,
  LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { AuditLogEntry } from "../../types/game";
import { useDialogSounds } from "../../hooks/useDialogSounds";
import { usePresence } from "../../hooks/usePresence";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { eventLabel, prettifyActor, ReplayIconKey, replayEventMeta, ReplayTone } from "../../utils/replayEvents";
import { playUiConfirmSound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";

const TITLE_ID = "incident-replay-title";
const PLAYBACK_INTERVAL_MS = 700;

const ICONS: Record<ReplayIconKey, LucideIcon> = {
  alert: AlertTriangle,
  bell: Bell,
  search: Search,
  target: Target,
  wrench: Wrench,
  shield: ShieldAlert,
  gavel: Gavel,
  bot: Bot,
  zap: Zap,
  check: CheckCircle2,
  users: Users,
  dot: Circle,
};

const NODE_TONE: Record<ReplayTone, string> = {
  critical: "border-rose-500 bg-rose-500/15 text-rose-300",
  warning: "border-amber-500 bg-amber-500/15 text-amber-300",
  success: "border-emerald-500 bg-emerald-500/15 text-emerald-300",
  info: "border-sky-500 bg-sky-500/15 text-sky-300",
};

// FAST-FORWARD REPLAY OF EVERY LEDGER EVENT CORRELATED TO ONE INCIDENT, SCRUBBED TICK BY TICK
export default function IncidentReplayModal() {
  const t = useTranslation();
  const copy = t.gameplayModals.replay;
  const incidentId = useGameStore((s) => s.replayIncidentId);
  const close = useGameStore((s) => s.closeIncidentReplay);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const reduced = useReducedMotion();
  const [allAudits, setAllAudits] = useState<AuditLogEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLLIElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: heldId } = usePresence(incidentId);
  const open = incidentId !== null;
  useDialogSounds(open, "back");

  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;
    setVisibleCount(1);
    setPlaying(true);
    api
      .getAllAudits()
      .then((rows) => {
        if (!cancelled) setAllAudits(rows);
      })
      .catch(() => {
        if (!cancelled) setAllAudits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  // correlate ledger rows to this incident the same way the backend's postmortem query does:
  // a substring match against the serialized details payload
  const events = useMemo(() => {
    if (!heldId) return [];
    return allAudits
      .filter((entry) => JSON.stringify(entry.details).includes(heldId))
      .sort((a, b) => a.tick - b.tick);
  }, [allAudits, heldId]);

  useEffect(() => {
    if (!playing) return;
    if (visibleCount >= events.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setVisibleCount((v) => v + 1), PLAYBACK_INTERVAL_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, visibleCount, events.length, speed]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  // follow the newest node while the timeline plays
  useEffect(() => {
    if (playing) endRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [visibleCount, playing, reduced]);

  if (!heldId) return null;

  const visibleEvents = events.slice(0, visibleCount);
  const finished = events.length > 0 && visibleCount >= events.length && !playing;

  const handleExportReplay = async () => {
    try {
      const payload = {
        incidentId: heldId,
        exportedAt: new Date().toISOString(),
        totalEvents: events.length,
        timeline: events.map((e) => ({
          tick: e.tick,
          event_type: e.event_type,
          actor: e.actor,
          details: e.details,
          compliance_flag: e.compliance_flag,
        })),
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      playUiConfirmSound();
      setCopied(true);
      pushFloatingText(copy.copiedToast, "success");
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      pushFloatingText(copy.copyFailedToast, "danger");
    }
  };

  const restart = () => {
    setVisibleCount(1);
    setPlaying(true);
  };

  return (
    <Modal open={open} onClose={close} labelledBy={TITLE_ID} layer="system" size="md">
      <ModalHeader
        id={TITLE_ID}
        title={t.incidentReplay.title(heldId)}
        icon={<Film className="w-4 h-4 text-sky-400 shrink-0" />}
        onClose={close}
        closeLabel={t.common.close}
      />

      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 border-b border-slate-800 text-[10px] text-slate-500">
        <span className="tabular-nums font-semibold uppercase tracking-wide">{copy.eventCount(events.length)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
            {copy.compliant}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" aria-hidden="true" />
            {copy.flagged}
          </span>
        </span>
      </div>

      <ModalBody className="px-5 py-4">
        {events.length === 0 && <p className="text-center text-xs text-slate-500 py-8">{t.incidentReplay.empty}</p>}
        <ol aria-label={copy.timelineLabel} className="relative flex flex-col">
          {visibleEvents.map((event, idx) => {
            const meta = replayEventMeta(event.event_type, event.compliance_flag);
            const Icon = ICONS[meta.icon];
            const last = idx === visibleEvents.length - 1 && !finished;
            return (
              <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0 animate-item-in">
                {/* rail segment to the next node; the newest node ends the rail */}
                {idx < events.length - 1 && <span aria-hidden="true" className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-700" />}
                <span
                  className={`relative z-10 w-7 h-7 shrink-0 rounded-full border flex items-center justify-center ${NODE_TONE[meta.tone]} ${
                    last && !reduced ? "ring-2 ring-offset-2 ring-offset-slate-900 ring-white/15" : ""
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100">{eventLabel(event.event_type, copy.events)}</span>
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0">T+{event.tick}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>
                      {copy.actorLabel} {prettifyActor(event.actor)}
                    </span>
                    <span className={event.compliance_flag ? "text-emerald-500" : "text-rose-400"}>
                      {event.compliance_flag ? copy.compliant : copy.flagged}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
          <li ref={endRef} aria-hidden="true" className="h-px" />
        </ol>
        {finished && <p className="mt-3 text-center text-[10px] uppercase tracking-wide text-slate-600">{copy.finished}</p>}
      </ModalBody>

      <ModalFooter className="flex-wrap !justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={events.length === 0 || finished}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-bold transition-colors duration-fast"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? t.incidentReplay.pause : t.incidentReplay.play}
          </button>
          <button
            type="button"
            onClick={restart}
            disabled={events.length === 0}
            aria-label={copy.restart}
            title={copy.restart}
            className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors duration-fast"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={events.length}
          aria-valuenow={Math.min(visibleCount, events.length)}
          className="flex-1 min-w-[4rem] h-1.5 rounded-full bg-slate-800 overflow-hidden"
        >
          <div
            className="h-full w-full origin-left bg-sky-500 transition-transform duration-base"
            style={{ transform: `scaleX(${events.length ? Math.min(1, visibleCount / events.length) : 0})` }}
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={copy.speed}>
          {([1, 2] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors duration-fast ${
                speed === s ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-800"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExportReplay}
          disabled={events.length === 0}
          title={copy.shareTitle}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-sky-200 text-xs font-semibold border border-slate-700 disabled:opacity-40 transition-colors duration-fast"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
          {copied ? copy.copied : copy.share}
        </button>
      </ModalFooter>
    </Modal>
  );
}
