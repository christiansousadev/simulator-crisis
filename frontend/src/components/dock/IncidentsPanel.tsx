import { CheckCircle2, TimerReset } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateIncidentTitle } from "../../i18n/dynamicContent";
import { Language } from "../../i18n/language";
import { useGameStore } from "../../store/useGameStore";
import { Incident, Service } from "../../types/game";
import { activeDurationTicks, countDependents, isBreachImminent, ticksToRegulatoryBreach } from "../../utils/incidentImpact";
import { lifecycleIndex } from "../../utils/incidentLifecycle";
import { severityTone, sortIncidentsByPriority } from "../../utils/severity";
import { playStampSound } from "../../utils/sound";
import EmptyState from "../common/EmptyState";
import IncidentActionButton from "../common/IncidentActionButton";
import IncidentLifecycleTrack from "../common/IncidentLifecycleTrack";
import SeverityBadge from "../common/SeverityBadge";
import TransitionList from "../common/TransitionList";

// how long a just-resolved card stays on screen wearing its stamp before it collapses
const STAMP_MS = 1100;

interface CardItem {
  incident: Incident;
  // resolved this frame: kept briefly with a stamp, then handed to the list's exit animation
  ghost: boolean;
}

// KEEPS INCIDENTS THAT JUST LEFT THE ACTIVE LIST AROUND FOR A MOMENT, flagged as resolved, so the
// card can play its stamp before the list collapses it
function useResolvedGhosts(incidents: Incident[], quiet: boolean): Incident[] {
  const prev = useRef(incidents);
  const [ghosts, setGhosts] = useState<Incident[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const liveIds = new Set(incidents.map((i) => i.id));
    const gone = prev.current.filter((i) => !liveIds.has(i.id));
    prev.current = incidents;
    // an id that came back is not a ghost any more
    setGhosts((cur) => (cur.some((g) => liveIds.has(g.id)) ? cur.filter((g) => !liveIds.has(g.id)) : cur));
    if (gone.length === 0) return;
    setGhosts((cur) => [...cur, ...gone.filter((g) => !cur.some((c) => c.id === g.id)).map((g) => ({ ...g, status: "resolved" as const }))]);
    if (!quiet) playStampSound();
    for (const g of gone) {
      timers.current.set(
        g.id,
        setTimeout(() => {
          timers.current.delete(g.id);
          setGhosts((cur) => cur.filter((c) => c.id !== g.id));
        }, STAMP_MS)
      );
    }
  }, [incidents, quiet]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return ghosts;
}

interface CardProps {
  item: CardItem;
  service: Service | undefined;
  dependents: number;
  currentTick: number;
  isMitigating: boolean;
  language: Language;
  onOpen: (incident: Incident) => void;
  // observer cards are plain status cards: no open-briefing button, no action button
  readOnly: boolean;
}

const IncidentCard = memo(function IncidentCard({ item, service, dependents, currentTick, isMitigating, language, onOpen, readOnly }: CardProps) {
  const t = useTranslation();
  const { incident: inc, ghost } = item;
  const tone = severityTone(inc.severity);
  const serviceName = service?.name ?? inc.service_id;
  const title = translateIncidentTitle(inc.title, language);
  const breachSoon = isBreachImminent(inc);
  const titleBlock = (
    <>
      <span className="block truncate text-xs font-semibold text-slate-100">{serviceName}</span>
      <span className="block truncate text-xs text-slate-400">{title}</span>
    </>
  );

  return (
    <div data-tour="incident-card" className="relative h-full rounded-lg bg-slate-900/80 shadow-md">
      <div
        // the severity tone owns the border and tint; hover only brightens, so a P1/P2 card never
        // loses its severity colour to a generic hover border
        className={`relative flex h-full flex-col gap-1.5 rounded-lg border p-3 transition-[filter,background-color] duration-base ${readOnly ? "" : "hover:brightness-125"} ${tone.ring}`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <SeverityBadge severity={inc.severity} className="mt-0.5" />
          {/* stretched button: the whole card opens the briefing, with real button semantics and a
              keyboard focus ring, while the action buttons below stay independently clickable */}
          {readOnly ? (
            <div data-readonly="true" className="min-w-0 flex-1 text-left">
              {titleBlock}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(inc)}
              aria-label={t.hud.incidents.openCard(serviceName, title)}
              data-stretched="true"
              className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-sky-400"
            >
              {titleBlock}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 text-caption text-slate-400">
          <span className="font-mono tabular-nums">{t.incidents.activeFor(activeDurationTicks(inc, currentTick))}</span>
          <span aria-hidden>·</span>
          <span>{service?.tier === "critical" ? t.incidents.impactTier.critical : t.incidents.impactTier.standard}</span>
          {dependents > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{t.incidents.dependentsAffected(dependents)}</span>
            </>
          )}
        </div>

        <IncidentLifecycleTrack index={lifecycleIndex(inc, isMitigating)} />

        <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-slate-800/70 pt-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {inc.status === "active" && (
              <span
                className={`flex shrink-0 items-center gap-0.5 font-mono text-caption tabular-nums ${
                  breachSoon ? "font-bold text-rose-300" : "text-slate-400"
                }`}
              >
                <TimerReset className="h-3 w-3" aria-hidden />
                {t.incidents.sanctionCountdown(ticksToRegulatoryBreach(inc))}
              </span>
            )}
            {/* technical id, kept as a secondary footnote */}
            <span className="truncate font-mono text-micro text-slate-500">#{inc.id}</span>
          </div>
          {!ghost && !readOnly && <IncidentActionButton incident={inc} />}
        </div>

        {ghost && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-950/60">
            <span className="rounded border-2 border-emerald-400 px-3 py-0.5 font-heading text-xl font-extrabold uppercase tracking-[0.25em] text-emerald-300 animate-stamp-in">
              {t.hud.incidents.resolvedStamp}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// PRIORITY LIST OF ACTIVE INCIDENTS, worst severity first then longest-waiting, each card a
// lifecycle track (New -> Acknowledged -> Investigated -> Mitigating -> Resolved) with exactly the
// next action on it. Rows enter, re-order and leave with animation; a resolved card is stamped first.
//
// readOnly (the /live-ops observer) renders the same cards as non-interactive status cards.
export default function IncidentsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const runAnimations = useGameStore((s) => s.runAnimations);
  const openIncidentDetail = useGameStore((s) => s.openIncidentDetail);

  const ghosts = useResolvedGhosts(incidents, readOnly);

  const items = useMemo<CardItem[]>(() => {
    const live = incidents.map((incident) => ({ incident, ghost: false }));
    const gone = ghosts.map((incident) => ({ incident, ghost: true }));
    const byId = new Map([...live, ...gone].map((it) => [it.incident.id, it]));
    return sortIncidentsByPriority([...byId.values()].map((it) => it.incident)).map((i) => byId.get(i.id)!);
  }, [incidents, ghosts]);

  const mitigatingServices = useMemo(
    () => new Set(runAnimations.filter((a) => a.kind === "mitigate").map((a) => a.serviceId)),
    [runAnimations]
  );

  if (items.length === 0) {
    return <EmptyState icon={CheckCircle2} iconClass="text-emerald-400" title={t.hud.incidents.emptyTitle} hint={t.hud.incidents.emptyHint} />;
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-2">
      <TransitionList
        items={items}
        getKey={(it) => it.incident.id}
        exitMs={220}
        // cards fill the row: one incident stretches across, several pack into as many columns as fit
        className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-2.5"
        itemClassName="min-w-0"
      >
        {(it) => {
          const service = services.find((s) => s.id === it.incident.service_id);
          return (
            <IncidentCard
              item={it}
              service={service}
              dependents={countDependents(service, services)}
              currentTick={currentTick}
              isMitigating={mitigatingServices.has(it.incident.service_id)}
              language={language}
              onOpen={openIncidentDetail}
              readOnly={readOnly}
            />
          );
        }}
      </TransitionList>
    </div>
  );
}
