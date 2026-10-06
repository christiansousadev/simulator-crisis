import { Check, Terminal, Wrench } from "lucide-react";
import { memo, MouseEvent } from "react";
import { useAcknowledgeIncident } from "../../hooks/useAcknowledgeIncident";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import { nextIncidentAction } from "../../utils/incidentLifecycle";
import { playClickSound } from "../../utils/sound";
import Spinner from "./Spinner";

interface IncidentActionButtonProps {
  incident: Incident;
  // called after the action so a host (the office alert stack) can also pan the camera
  onFocusService?: (serviceId: string) => void;
  compact?: boolean;
  className?: string;
  // observer screens: the button is never rendered, so no command can be issued from there
  readOnly?: boolean;
}

const BASE =
  "flex shrink-0 items-center justify-center gap-1 rounded font-bold transition-[background-color,transform,opacity] duration-fast active:scale-95 disabled:cursor-wait disabled:opacity-70";

// THE ONE BUTTON AN INCIDENT CARD SHOWS: whichever step comes next in
// Acknowledge -> Investigate logs -> Choose runbook. Shared by the dock card and the alert stack so
// both behave identically (same beep, same toast, same pending state, same colours).
export default memo(function IncidentActionButton({ incident, onFocusService, compact = false, className = "", readOnly = false }: IncidentActionButtonProps) {
  const t = useTranslation();
  const { acknowledge, isAcknowledging } = useAcknowledgeIncident();
  const selectService = useGameStore((s) => s.selectService);
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);
  const setDockTab = useGameStore((s) => s.setDockTab);
  const action = nextIncidentAction(incident);
  const size = compact ? "px-2 py-1 text-micro" : "px-3 py-1.5 text-caption";

  if (action === "none" || readOnly) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();

  if (action === "acknowledge") {
    const pending = isAcknowledging(incident.id);
    return (
      <button
        type="button"
        data-tour="incident-ack"
        disabled={pending}
        aria-busy={pending}
        title={t.hud.incidents.alerts.ackTitle}
        onClick={(e) => {
          stop(e);
          void acknowledge(incident);
        }}
        className={`${BASE} ${size} bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.25)] hover:bg-amber-300 ${className}`}
      >
        {pending ? <Spinner size="sm" className="text-slate-900" /> : <Check className="h-3 w-3" aria-hidden />}
        {pending ? t.hud.incidents.acknowledging : t.hud.incidents.next.acknowledge}
      </button>
    );
  }

  if (action === "investigate") {
    return (
      <button
        type="button"
        data-tour="incident-investigate"
        title={t.hud.incidents.alerts.investigateTitle}
        onClick={(e) => {
          stop(e);
          playClickSound();
          selectService(incident.service_id);
          onFocusService?.(incident.service_id);
          openTriageTerminal(incident.id);
        }}
        className={`${BASE} ${size} bg-sky-400 text-slate-950 hover:bg-sky-300 ${className}`}
      >
        <Terminal className="h-3 w-3" aria-hidden />
        {t.hud.incidents.next.investigate}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        playClickSound();
        selectService(incident.service_id);
        onFocusService?.(incident.service_id);
        setDockTab("directives");
      }}
      className={`${BASE} ${size} bg-cyan-400 text-slate-950 hover:bg-cyan-300 ${className}`}
    >
      <Wrench className="h-3 w-3" aria-hidden />
      {t.hud.incidents.next.chooseRunbook}
    </button>
  );
});
