import { AlertOctagon, ChevronRight, Clock } from "lucide-react";
import { memo, useMemo } from "react";
import { useChangeSeq } from "../../hooks/useChangeSeq";
import { useTranslation } from "../../i18n/useTranslation";
import { translateIncidentTitle } from "../../i18n/dynamicContent";
import { Language } from "../../i18n/language";
import { useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import { REGULATORY_BREACH_TICK } from "../../utils/incidentImpact";
import { sortIncidentsByPriority } from "../../utils/severity";
import IncidentActionButton from "./IncidentActionButton";
import SeverityBadge from "./SeverityBadge";
import TransitionList from "./TransitionList";

interface IncidentAlertStackProps {
  onFocusService?: (serviceId: string) => void;
}

interface AlertCardProps {
  incident: Incident;
  language: Language;
  onOpen: (incident: Incident) => void;
  onFocusService?: (serviceId: string) => void;
}

const AlertCard = memo(function AlertCard({ incident: inc, language, onOpen, onFocusService }: AlertCardProps) {
  const t = useTranslation();
  const isCritical = inc.severity === "P1_CRITICAL";
  const unattended = inc.status === "active"; // active means unacknowledged
  const mtta = inc.mtta_seconds;
  const urgencyPct = Math.min(100, (mtta / REGULATORY_BREACH_TICK) * 100);
  const title = translateIncidentTitle(inc.title, language);

  return (
    <div
      className={`relative rounded-xl border p-2.5 shadow-xl backdrop-blur-xl transition-[filter,transform] duration-base hover:-translate-x-0.5 hover:brightness-125 ${
        isCritical
          ? "border-rose-500/70 bg-slate-950/90 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
          : "border-amber-500/50 bg-slate-950/85 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <SeverityBadge severity={inc.severity} />
        <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-micro font-bold uppercase text-sky-300">
          {inc.service_id}
        </span>
      </div>

      {/* stretched button: the whole card focuses the service and opens the briefing */}
      <button
        type="button"
        onClick={() => onOpen(inc)}
        aria-label={t.hud.incidents.openCard(inc.service_id, title)}
        data-stretched="true"
        className="mb-2 block w-full truncate text-left text-xs font-semibold text-slate-100 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-sky-400"
      >
        {title}
      </button>

      {unattended && (
        <div className="mb-2">
          <div className="mb-0.5 flex items-center justify-between font-mono text-micro">
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="h-2.5 w-2.5 text-amber-300" aria-hidden /> {t.hud.incidents.alerts.mttaRisk}
            </span>
            <span className={`tabular-nums ${mtta >= 10 ? "font-bold text-rose-300" : "text-amber-300"}`}>
              {t.hud.incidents.alerts.ticks(mtta, REGULATORY_BREACH_TICK)}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-[width,background-color] duration-slow ${mtta >= 10 ? "bg-rose-500" : mtta >= 6 ? "bg-amber-400" : "bg-sky-400"}`}
              style={{ width: `${urgencyPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="relative z-10 flex items-center gap-1.5 border-t border-slate-800/80 pt-1.5">
        {!unattended && inc.status === "acknowledged" && (
          <span className="flex-1 font-mono text-micro font-bold text-emerald-300">{t.hud.incidents.alerts.mttaFrozen}</span>
        )}
        {unattended && <span className="flex-1" />}
        <IncidentActionButton incident={inc} onFocusService={onFocusService} compact />
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
      </div>
    </div>
  );
});

// OFFICE-OVERLAY STACK OF THE ACTIVE THREATS, worst first. Same card contract as the dock: the card
// opens the briefing, the single action button is always the next step, and acknowledging gives the
// same beep, toast and pending state everywhere. Sits below the objective tracker (which publishes
// its height as --objective-tracker-h) so the two never overlap.
export default function IncidentAlertStack({ onFocusService }: IncidentAlertStackProps) {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const openIncidentDetail = useGameStore((s) => s.openIncidentDetail);
  const selectService = useGameStore((s) => s.selectService);
  const count = activeIncidents.length;
  const countSeq = useChangeSeq(count);

  const sorted = useMemo(() => sortIncidentsByPriority(activeIncidents), [activeIncidents]);

  if (count === 0) return null;

  const handleOpen = (inc: Incident) => {
    selectService(inc.service_id);
    onFocusService?.(inc.service_id);
    openIncidentDetail(inc);
  };

  return (
    <aside
      aria-label={t.hud.incidents.alerts.label}
      style={{ top: "calc(0.75rem + var(--objective-tracker-h, 0px))" }}
      className="pointer-events-auto absolute right-3 z-hud flex w-full max-w-xs select-none flex-col gap-2"
    >
      <div className="flex items-center justify-between rounded border border-rose-500/40 bg-rose-950/80 px-2 py-0.5 font-mono text-micro font-bold uppercase tracking-wider text-rose-200 backdrop-blur-md">
        <span key={countSeq} className={`flex items-center gap-1.5 ${countSeq > 0 ? "animate-badge-bump" : ""}`}>
          <AlertOctagon className="h-3.5 w-3.5 text-rose-300" aria-hidden />
          {t.hud.incidents.alerts.header(count)}
        </span>
        <span className="text-slate-300">{t.hud.incidents.alerts.tabHint}</span>
      </div>

      <TransitionList
        items={sorted}
        getKey={(i) => i.id}
        exitMs={200}
        className="no-scrollbar flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto"
      >
        {(inc) => <AlertCard incident={inc} language={language} onOpen={handleOpen} onFocusService={onFocusService} />}
      </TransitionList>
    </aside>
  );
}
