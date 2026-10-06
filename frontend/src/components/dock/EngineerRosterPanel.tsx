import { AlertTriangle, Moon, UserPlus, Users, X, Zap } from "lucide-react";
import { memo, useId, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { Engineer } from "../../types/game";
import { HIGH_STRESS_THRESHOLD } from "../../utils/kpiBands";
import { claimLocalSpend } from "../../utils/localSpendClaims";
import {
  coveredServiceId,
  defaultHireTarget,
  HIRE_COMPETENCIES,
  HireCompetency,
  isSpecialistMatch,
  MISMATCH_QUALITY,
  targetForService,
  uncoveredServiceIds,
} from "../../utils/staffCoverage";
import { SERVICE_IDS } from "../../utils/scenarioConfig";
import { playCashSound, playClickSound, playErrorSound } from "../../utils/sound";
import { runExclusive, usePendingAction } from "../../hooks/useAsyncAction";
import EmptyState from "../common/EmptyState";
import Spinner from "../common/Spinner";
import TransitionList from "../common/TransitionList";

const HIRING_COST = 15000;
const HIRE_KEY = "hire-engineer";
// stress at or above this reads as "this engineer needs a break" (also drives the dock badge)
export const HIGH_STRESS = 75;

// tone for a 0-100 stat bar, shared between stress (high = bad) and stamina (low = bad)
function barTone(value: number, invert: boolean) {
  const effective = invert ? 100 - value : value;
  if (effective < 50) return "bg-emerald-500";
  if (effective < 75) return "bg-amber-500";
  return "bg-rose-500";
}

function StatBar({ label, value, invert }: { label: string; value: number; invert: boolean }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-caption text-slate-300">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-slow ease-out-expo ${barTone(value, invert)}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

const EngineerRow = memo(function EngineerRow({ eng, onRotate }: { eng: Engineer; onRotate: (id: string) => void }) {
  const t = useTranslation();
  const covered = coveredServiceId(eng);
  const stressed = eng.stress_index >= HIGH_STRESS_THRESHOLD;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-2 transition-colors duration-slow ${
        stressed ? "border-rose-500/40 bg-rose-950/20" : "border-slate-800 bg-slate-900/80"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-bold text-slate-100">{eng.name}</span>
            {stressed && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-rose-500/15 px-1 py-0.5 text-micro font-bold text-rose-300">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                {t.hud.roster.stressAlert}
              </span>
            )}
          </span>
          <span className="shrink-0 font-heading text-micro font-semibold uppercase tracking-wider text-slate-300">
            {t.staff.competencies[eng.core_competency]}
          </span>
        </div>
        <p className={`truncate text-caption ${covered ? "text-slate-300" : "text-slate-500"}`} data-testid="engineer-coverage">
          {covered ? t.uiGaps.hire.covers(t.flow.serviceNames[covered] ?? covered) : t.uiGaps.hire.reserve}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <StatBar label={t.staff.stress} value={eng.stress_index} invert={false} />
          <StatBar label={t.staff.stamina} value={eng.stamina} invert />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRotate(eng.id)}
        className="flex shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-caption font-bold text-slate-200 transition-colors hover:bg-slate-800"
        title={t.staff.rotateShift}
      >
        {eng.on_call_status === "on_duty" ? <Moon className="h-3 w-3" aria-hidden /> : <Zap className="h-3 w-3" aria-hidden />}
        {t.staff.onCallStatus[eng.on_call_status]}
      </button>
    </div>
  );
});

// on-call staff roster: hiring (specialty + the service the hire covers), per-engineer
// stress/stamina and shift rotation
export default function EngineerRosterPanel() {
  const t = useTranslation();
  const engineers = useGameStore((s) => s.telemetry.engineers);
  const budget = useGameStore((s) => s.telemetry.budget);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const pushKpiEvent = useGameStore((s) => s.pushKpiEvent);
  const [hiring, setHiring] = useState(false);
  const [target, setTarget] = useState(() => defaultHireTarget(engineers));
  const hirePending = usePendingAction(HIRE_KEY);
  const serviceSelectId = useId();
  const reasonId = useId();

  const serviceName = (id: string) => t.flow.serviceNames[id] ?? id;
  const uncovered = uncoveredServiceIds(engineers);
  const canAfford = budget >= HIRING_COST;
  const matches = isSpecialistMatch(target.competency, target.serviceId);
  const money = (n: number) => `$${n.toLocaleString()}`;
  const cashReason = canAfford ? null : t.uiGaps.hire.needCash(money(HIRING_COST), money(HIRING_COST - budget));

  const openHiring = () => {
    // re-seed from the current roster each time, so the pre-selected service is a real vacancy
    setTarget(defaultHireTarget(engineers));
    setHiring(true);
  };

  const handleHire = () => {
    if (!canAfford) return;
    playClickSound();
    const before = useGameStore.getState().telemetry.engineers.length;
    void runExclusive(HIRE_KEY, () => api.hireEngineer(target.competency, target.serviceId), {
      // pending until the new engineer is actually in the roster, so a second click cannot double-hire
      confirmed: (s) => s.telemetry.engineers.length > before,
      onSuccess: () => {
        pushFloatingText(`-$${HIRING_COST.toLocaleString()} :: ${t.staff.hireEngineer}`, "info");
        claimLocalSpend("ENGINEER_HIRED");
        pushKpiEvent("budget", -HIRING_COST, t.hud.chip.hire);
        playCashSound();
        setHiring(false);
      },
      onError: (err) => {
        playErrorSound();
        pushFloatingText(err instanceof Error && err.message ? err.message : t.upgrades.insufficientBudget, "danger");
      },
    });
  };

  const handleRotate = async (engineerId: string) => {
    playClickSound();
    try {
      await api.rotateShift(engineerId);
    } catch (err) {
      playErrorSound();
      pushFloatingText(err instanceof Error && err.message ? err.message : t.staff.insufficientStamina, "danger");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {engineers.length === 0 ? (
          <EmptyState icon={Users} title={t.hud.roster.emptyTitle} hint={t.hud.roster.emptyHint} />
        ) : (
          <TransitionList items={engineers} getKey={(e) => e.id} className="grid grid-cols-[repeat(auto-fit,minmax(19rem,1fr))] gap-1.5">
            {(eng) => <EngineerRow eng={eng} onRotate={handleRotate} />}
          </TransitionList>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-slate-800 p-2">
        {uncovered.length > 0 && (
          <p className="text-caption text-amber-300" data-testid="roster-vacancies">
            {t.uiGaps.hire.vacancies(uncovered.map(serviceName).join(", "))}
          </p>
        )}
        {!hiring ? (
          <>
            <button
              type="button"
              onClick={openHiring}
              disabled={!canAfford || hirePending}
              aria-describedby={cashReason ? reasonId : undefined}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-600 py-1.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-900/60 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {hirePending ? <Spinner size="sm" label={t.hud.roster.hiring} /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}
              {!hirePending && (
                <span>
                  {t.staff.hireEngineer} ({t.staff.hiringCost(money(HIRING_COST))})
                </span>
              )}
            </button>
            {cashReason && (
              <p id={reasonId} className="text-caption text-rose-300">
                {cashReason}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="hire-form">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 font-heading text-micro font-bold uppercase tracking-wider text-slate-300">
                  {hirePending ? t.hud.roster.hiring : t.uiGaps.hire.specialty}
                </span>
                <div role="group" aria-label={t.uiGaps.hire.specialty} className="flex gap-1">
                  {HIRE_COMPETENCIES.map((c: HireCompetency) => (
                    <button
                      type="button"
                      key={c}
                      disabled={hirePending}
                      aria-pressed={target.competency === c}
                      onClick={() => setTarget((cur) => ({ ...cur, competency: c }))}
                      title={t.hud.roster.hireTitle(t.staff.competencies[c])}
                      className={`rounded-md border px-2 py-1 text-caption font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                        target.competency === c
                          ? "border-cyan-400 bg-cyan-900/70 text-cyan-100"
                          : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {t.staff.competencies[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <label htmlFor={serviceSelectId} className="shrink-0 font-heading text-micro font-bold uppercase tracking-wider text-slate-300">
                  {t.uiGaps.hire.service}
                </label>
                <select
                  id={serviceSelectId}
                  value={target.serviceId}
                  disabled={hirePending}
                  onChange={(e) => setTarget((cur) => targetForService(e.target.value, cur.competency))}
                  className="min-w-0 rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-caption text-slate-100 disabled:opacity-60"
                >
                  {SERVICE_IDS.map((id) => {
                    const tags = [
                      isSpecialistMatch(target.competency, id) ? t.uiGaps.hire.recommended : null,
                      uncovered.includes(id) ? t.uiGaps.hire.vacant : null,
                    ].filter(Boolean);
                    return (
                      <option key={id} value={id}>
                        {serviceName(id)}
                        {tags.length > 0 ? ` (${tags.join(", ")})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p
                role="status"
                data-testid="hire-consequence"
                data-match={matches}
                className={`min-w-0 flex-1 text-caption font-semibold ${matches ? "text-emerald-300" : "text-amber-300"}`}
              >
                {matches ? t.uiGaps.hire.matchLine : t.uiGaps.hire.mismatchLine(MISMATCH_QUALITY.toFixed(2))}
              </p>
              {hirePending && <Spinner size="sm" />}
              <button
                type="button"
                onClick={handleHire}
                disabled={!canAfford || hirePending}
                aria-describedby={cashReason ? reasonId : undefined}
                className="flex shrink-0 items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-950/60 px-3 py-1 text-caption font-bold text-cyan-200 transition-colors hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserPlus className="h-3 w-3" aria-hidden />
                {t.uiGaps.hire.confirm(money(HIRING_COST))}
              </button>
              <button
                type="button"
                onClick={() => setHiring(false)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-caption font-bold text-slate-300 transition-colors hover:bg-slate-800"
              >
                <X className="h-3 w-3" aria-hidden />
                {t.hud.roster.cancelHire}
              </button>
            </div>
            {cashReason && (
              <p id={reasonId} className="text-caption text-rose-300">
                {cashReason}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
