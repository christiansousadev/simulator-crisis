import { memo, useCallback, useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { isRedAlertLevel, selectDefconLevel } from "../../utils/defcon";
import { setDeskSipping } from "./deskLife";
import { deriveWorkerMood } from "./engineerMood";
import OfficeWorker, { WorkerMood } from "./OfficeWorker";
import { deskScreenColor } from "./officeLifeUtils";
import { appearanceFor } from "./rosterPlan";
import type { WalkEasing, WalkerView } from "./rosterStage";
import type { IdleGesture } from "./workerRig";
import { NODE } from "./waypointGraph";

// css timing for each hop easing: a route accelerates out of a standstill and brakes into the stop
const EASING_CSS: Record<WalkEasing, string> = {
  linear: "linear",
  "ease-in": "cubic-bezier(0.4, 0, 1, 1)",
  "ease-out": "cubic-bezier(0, 0, 0.6, 1)",
  "ease-in-out": "cubic-bezier(0.4, 0, 0.6, 1)",
};

const DESK_GESTURES: IdleGesture[] = ["look", "watch", "sip"];
const DESK_GESTURES_BUSY: IdleGesture[] = ["look"];

interface PathfindingEmployeeProps {
  view: WalkerView;
  /** clicking a seated engineer selects the service they work on, like clicking the desk would */
  onSelect?: (serviceId: string) => void;
}

// A HIRED ENGINEER'S SPRITE. rosterStage walks `view` hop by hop along the waypoint graph; this
// component only turns that position into a sprite whose mood, glow and pose follow the engineer's
// live telemetry (stress, stamina, the incident on their service, an acknowledge or mitigation in flight).
function PathfindingEmployee({ view, onSelect }: PathfindingEmployeeProps) {
  const t = useTranslation();
  const engineer = useGameStore((s) => s.telemetry.engineers.find((e) => e.id === view.id));
  const serviceId = engineer?.assigned_service_id ?? null;
  const serviceStatus = useGameStore((s) =>
    serviceId ? (s.telemetry.services.find((svc) => svc.id === serviceId)?.status ?? "healthy") : "healthy"
  );
  const hasIncident = useGameStore((s) => (serviceId ? s.telemetry.active_incidents.some((i) => i.service_id === serviceId) : false));
  const investigating = useGameStore((s) =>
    serviceId ? s.telemetry.active_incidents.some((i) => i.id === s.triageIncidentId && i.service_id === serviceId) : false
  );
  const acknowledging = useGameStore((s) =>
    serviceId ? s.runAnimations.some((a) => a.serviceId === serviceId && a.kind === "acknowledge") : false
  );
  const mitigating = useGameStore((s) =>
    serviceId ? s.runAnimations.some((a) => a.serviceId === serviceId && a.kind === "mitigate") : false
  );
  // the service this engineer looks after just came back: arms up
  const restored = useGameStore((s) =>
    serviceId ? s.runAnimations.some((a) => a.serviceId === serviceId && a.kind === "recover") : false
  );

  const redAlert = useGameStore((s) => isRedAlertLevel(selectDefconLevel(s)));

  // while this engineer sips at their desk, the desk's own mug leaves the desk
  const handleGesture = useCallback(
    (gesture: IdleGesture | null) => {
      if (serviceId) setDeskSipping(serviceId, gesture === "sip");
    },
    [serviceId]
  );
  // a sprite leaving mid-sip (reassigned, fired) puts the mug back
  useEffect(() => {
    if (!serviceId) return;
    return () => setDeskSipping(serviceId, false);
  }, [serviceId]);

  if (!engineer) return null;

  const look = appearanceFor(view.id);
  const atDesk = view.place === "desk" || view.place === "reserve";
  const hasAlarm = serviceStatus !== "healthy" || hasIncident;

  let mood: WorkerMood;
  if (view.place === "lounge") {
    mood = engineer.stamina < 30 ? "tired" : engineer.on_call_status === "resting" ? "recovering" : "happy";
  } else if (view.place === "entering") {
    mood = "idle";
  } else {
    mood = deriveWorkerMood(engineer, hasAlarm, investigating, mitigating);
  }

  // red alert: whoever is on their feet and heading for (or standing at) a failing rack hurries with a laptop
  const rushing = redAlert && hasAlarm && !view.seated && view.place !== "lounge" && view.place !== "entering" && engineer.on_call_status === "on_duty";
  if (rushing && mood === "idle") mood = "running";

  // an acknowledged alert makes the engineer stand and lean in at their own desk; the desk stays put
  const leaning = acknowledging && atDesk && view.seated;
  const screen = view.seated && atDesk ? deskScreenColor({ status: serviceStatus, investigating, mitigating, engineerPresent: true }) : null;

  // nobody stops for coffee while their own service is burning
  const deskGestures = view.seated && atDesk ? (hasAlarm ? DESK_GESTURES_BUSY : DESK_GESTURES) : undefined;

  const statusText = `${t.staff.competencies[engineer.core_competency]} · ${t.staff.onCallStatus[engineer.on_call_status]} · ${t.officeLife.places[view.place]}`.toUpperCase();

  return (
    <OfficeWorker
      x={view.x}
      y={view.y}
      z={leaning ? 0 : view.z}
      shirtColor={look.shirtColor}
      hairColor={look.hairColor}
      skinTone={look.skinTone}
      glasses={look.glasses}
      mood={mood}
      role="engineer"
      seated={view.seated && !leaning}
      leaning={leaning}
      typing={view.seated && atDesk && !leaning}
      badge
      holdsMug={view.mug}
      facing={view.facing}
      heading={view.heading}
      glowColor={screen ?? undefined}
      transitionMs={view.hopMs > 0 ? view.hopMs : 220}
      transitionEasing={EASING_CSS[view.easing]}
      fadeIn={view.nodeId === NODE.entrance}
      carriesLaptop={rushing}
      seedKey={view.id}
      alarmed={hasAlarm && view.place !== "lounge" && view.place !== "entering"}
      cheering={restored && !hasAlarm}
      lounging={view.place === "lounge" && view.seated}
      gestures={deskGestures}
      onGestureChange={handleGesture}
      name={engineer.name}
      workerStatusText={statusText}
      onActivate={serviceId && atDesk && onSelect ? () => onSelect(serviceId) : undefined}
    />
  );
}

export default memo(PathfindingEmployee);
