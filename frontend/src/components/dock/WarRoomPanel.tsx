import { CheckCircle2, Megaphone, MessageSquare, MessageSquareWarning } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { StatusStage } from "../../i18n/evolution";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import type { Incident } from "../../types/game";
import { playErrorSound, playSuccessSound } from "../../utils/sound";
import EmptyState from "../common/EmptyState";
import SeverityBadge from "../common/SeverityBadge";

const STAGES: StatusStage[] = ["investigating", "identified", "mitigating"];
// public updates are only expected for the incidents the stakeholders actually page about
const PUBLIC_SEVERITIES = new Set(["P1_CRITICAL", "P2_HIGH"]);
// how long a serious incident may stay unannounced before the silence warning shows (mirrors the engine's grace)
const SILENCE_GRACE_TICKS = 3;

// WAR ROOM: THE STAKEHOLDER FEED (CEO, SUPPORT, LEGAL, BOARD) PLUS THE PUBLIC STATUS PAGE CONTROLS.
// Everything shown is a projection of server state: the engine decides which messages are due and
// whether a posted stage is truthful; this panel only renders the feed and sends the post.
export default memo(function WarRoomPanel() {
  const t = useTranslation();
  const copy = t.evolution.warRoom;
  const feed = useGameStore((s) => s.telemetry.stakeholder_feed);
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const tick = useGameStore((s) => s.telemetry.tick);
  const [busy, setBusy] = useState<string | null>(null);

  const serviceName = useCallback((id: string) => services.find((s) => s.id === id)?.name ?? id, [services]);
  const openIds = useMemo(() => new Set(incidents.map((i) => i.id)), [incidents]);
  const messages = useMemo(() => [...(feed ?? [])].reverse(), [feed]);
  const publicIncidents = useMemo(() => incidents.filter((i) => PUBLIC_SEVERITIES.has(i.severity)), [incidents]);

  const post = async (incident: Incident, stage: StatusStage) => {
    const key = `${incident.id}:${stage}`;
    if (busy) return;
    setBusy(key);
    const store = useGameStore.getState();
    try {
      const result = await api.postStatusUpdate(incident.id, stage);
      const label = copy.stages[stage];
      if (result.truthful) {
        playSuccessSound();
        store.pushFloatingText(copy.truthfulToast(label), "success");
      } else {
        playErrorSound();
        store.pushFloatingText(copy.misleadingToast(label), "warning");
      }
    } catch (err) {
      playErrorSound();
      store.pushFloatingText(err instanceof Error && err.message ? err.message : copy.postFailed, "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-px bg-slate-800/60 md:grid-cols-2">
      <section aria-label={copy.header} className="flex min-h-0 flex-col bg-slate-950/90">
        <h3 className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5 font-heading text-xs font-bold uppercase tracking-wider text-slate-300">
          <MessageSquareWarning className="h-3.5 w-3.5 text-amber-400" aria-hidden />
          {copy.header}
        </h3>
        {messages.length === 0 ? (
          <EmptyState icon={MessageSquare} title={copy.feedEmpty} />
        ) : (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" aria-live="polite">
            {messages.map((m) => {
              const open = openIds.has(m.incident_id);
              return (
                <li key={m.id} className={`rounded-md border px-2.5 py-1.5 text-caption ${m.answered || !open ? "border-slate-800 bg-slate-900/40 text-slate-400" : "border-amber-500/40 bg-amber-500/5 text-slate-100"}`}>
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-micro uppercase tracking-wide">
                    <span className="font-bold text-amber-300">{copy.senders[m.sender]}</span>
                    <span className="flex items-center gap-1.5 text-slate-500">
                      {copy.tickLabel(m.tick)}
                      {m.answered ? (
                        <span className="flex items-center gap-0.5 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                          {copy.answered}
                        </span>
                      ) : open ? (
                        <span className="text-amber-400">{copy.unanswered}</span>
                      ) : null}
                    </span>
                  </div>
                  <p>{copy.messages[m.kind](serviceName(m.service_id))}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={copy.statusPage} className="flex min-h-0 flex-col bg-slate-950/90">
        <h3 className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5 font-heading text-xs font-bold uppercase tracking-wider text-slate-300">
          <Megaphone className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
          {copy.statusPage}
        </h3>
        <p className="shrink-0 px-3 pt-2 text-micro text-slate-500">{copy.statusHint}</p>
        {publicIncidents.length === 0 ? (
          <EmptyState icon={CheckCircle2} iconClass="text-emerald-400" title={copy.noOpenIncidents} />
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {publicIncidents.map((incident) => {
              const rank = incident.status_page_rank ?? 0;
              const silent = rank === 0 && tick - incident.created_tick > SILENCE_GRACE_TICKS;
              return (
                <li key={incident.id} className="rounded-md border border-slate-800 bg-slate-900/50 p-2">
                  <div className="mb-1.5 flex items-center gap-2 text-caption">
                    <SeverityBadge severity={incident.severity} />
                    <span className="truncate font-semibold text-slate-200">{serviceName(incident.service_id)}</span>
                  </div>
                  {silent && <p className="mb-1.5 text-micro font-semibold text-rose-300">{copy.silenceWarning}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {STAGES.map((stage, index) => {
                      const done = rank > index;
                      const key = `${incident.id}:${stage}`;
                      return (
                        <button
                          key={stage}
                          type="button"
                          disabled={done || busy !== null}
                          onClick={() => post(incident, stage)}
                          aria-label={done ? `${copy.stages[stage]} — ${copy.posted}` : copy.postAction(copy.stages[stage])}
                          className={`rounded-md border px-2 py-1 text-caption font-semibold transition-colors ${
                            done
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-cyan-500/40 text-cyan-200 hover:bg-cyan-950/50 disabled:opacity-50"
                          } ${busy === key ? "animate-pulse" : ""}`}
                        >
                          {done ? "✓ " : ""}
                          {copy.stages[stage]}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
});
