import { Engineer } from "../../types/game";
import { WorkerMood } from "./OfficeWorker";

const PANIC_STRESS_THRESHOLD = 75;
const TIRED_STAMINA_THRESHOLD = 25;

// DERIVE AN ENGINEER'S SPRITE MOOD FROM DUTY STATUS, STRESS, STAMINA AND ALARM STATE
export function deriveWorkerMood(engineer: Engineer, hasActiveAlarmOnAssignedService: boolean): WorkerMood {
  if (engineer.on_call_status === "off_duty") return "idle";
  if (engineer.on_call_status === "resting") return "recovering";
  if (engineer.stress_index > PANIC_STRESS_THRESHOLD) return "panic";
  if (engineer.stamina < TIRED_STAMINA_THRESHOLD) return "tired";
  if (hasActiveAlarmOnAssignedService) return "running";
  return "idle";
}
