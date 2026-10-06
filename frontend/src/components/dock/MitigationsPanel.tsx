import { Target } from "lucide-react";
import { memo, useMemo } from "react";
import { Translations } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { RunbookState, useMitigations } from "../../hooks/useMitigations";
import CooldownButton from "../common/CooldownButton";
import EmptyState from "../common/EmptyState";

const money = (n: number) => `−$${n.toLocaleString()}`;

// WHY A RUNBOOK CANNOT BE FIRED, IN WORDS THE PLAYER CAN ACT ON ("Need $2,300 more")
function blockedText(rb: RunbookState, t: Translations): string | null {
  switch (rb.blockedReason) {
    case "budget":
      return t.hud.mitigations.shortBy(`$${rb.missingCash.toLocaleString()}`);
    case "featureFreeze":
      return t.mitigations.blocked.featureFreeze;
    case "noIncident":
      return t.mitigations.blocked.noIncident;
    case "providerOutage":
      return t.mitigations.blocked.providerOutage;
    default:
      return null;
  }
}

const RunbookCard = memo(function RunbookCard({ rb, onRun }: { rb: RunbookState; onRun: (rb: RunbookState) => void }) {
  const t = useTranslation();
  const Icon = rb.icon;
  const copy = t.mitigations.actions[rb.actionId];
  const blocked = blockedText(rb, t);
  const discountNames = rb.discountSources.map((s) => (s === "cicd" ? t.hud.mitigations.discountCicd : t.hud.mitigations.discountTriage));
  const title = [
    copy.description,
    rb.discounted ? t.hud.mitigations.discountTitle(discountNames.join(", ")) : null,
    blocked && !rb.onCooldown ? blocked : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <CooldownButton
      data-tour={rb.actionId === "rollback" ? "runbook-rollback" : undefined}
      announceReady
      progress={rb.cooldownProgress}
      onClick={() => onRun(rb)}
      disabled={!!rb.blockedReason}
      title={title}
      className={`flex flex-col rounded-lg border p-2 text-left transition-colors duration-base disabled:cursor-not-allowed ${
        rb.blockedReason
          ? "border-slate-800 bg-slate-900/50"
          : rb.danger
          ? "border-rose-500/50 bg-rose-950/30 hover:bg-rose-950/50"
          : "border-slate-700 bg-slate-900/80 hover:bg-slate-800/80"
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="font-heading text-micro font-bold uppercase tracking-wider text-slate-300">{t.mitigations.categories[rb.category]}</span>
        <Icon className={`h-3.5 w-3.5 ${rb.danger ? "text-rose-400" : "text-slate-300"}`} aria-hidden />
      </span>
      <span className={`block text-xs font-bold ${rb.danger ? "text-rose-200" : "text-slate-100"}`}>{copy.name}</span>
      <span className="block text-caption leading-tight text-slate-300">{t.mitigations.impact[rb.actionId]}</span>
      <span className="mt-1 flex items-center justify-between gap-2 text-caption font-bold tabular-nums">
        <span className="flex items-baseline gap-1.5">
          <span className="text-slate-100">{money(rb.cost)}</span>
          {rb.discounted && (
            <s className="font-medium text-slate-400" title={t.hud.mitigations.listPrice(money(rb.listCost))}>
              {money(rb.listCost)}
            </s>
          )}
        </span>
        <span className={rb.techDebtDelta < 0 ? "text-emerald-300" : "text-amber-300"} title={t.hud.mitigations.tdiTitle(rb.techDebtDelta)}>
          {rb.techDebtDelta > 0 ? "+" : ""}
          {rb.techDebtDelta} {t.mitigations.tdiSuffix}
        </span>
      </span>
      <span className="mt-0.5 flex min-h-[1rem] items-center justify-between gap-2 text-micro font-bold tabular-nums">
        <span className={rb.danger ? "text-rose-300" : "text-transparent select-none"} aria-hidden={!rb.danger}>
          {t.mitigations.highRisk}
        </span>
        {rb.onCooldown ? (
          <span className="text-slate-200">{t.mitigations.readyIn(rb.readyInTicks)}</span>
        ) : blocked ? (
          <span className="truncate text-amber-300">{blocked}</span>
        ) : (
          <span className="text-emerald-300">{t.hud.mitigations.ready}</span>
        )}
      </span>
    </CooldownButton>
  );
});

// MANAGEMENT ACTION DECK: RUNBOOK DIRECTIVES TARGETING THE SELECTED SERVICE. Prices are the ones the
// server will really charge (CI/CD and root-cause discounts applied, list price struck through).
export default function MitigationsPanel() {
  const t = useTranslation();
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const selectService = useGameStore((s) => s.selectService);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const { runbooks, execute } = useMitigations(selectedServiceId);

  // unique service ids with an open incident, offered as one-click targets in the empty state
  const affectedServiceIds = useMemo(() => Array.from(new Set(activeIncidents.map((i) => i.service_id))), [activeIncidents]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-1 pt-2 text-caption font-semibold text-slate-300">
        {t.mitigations.targetLabel(
          selectedServiceId ? (services.find((s) => s.id === selectedServiceId)?.name ?? selectedServiceId) : t.common.none
        )}
      </div>

      {!selectedServiceId ? (
        <EmptyState icon={Target} title={t.mitigations.selectServiceHint}>
          {affectedServiceIds.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              <span className="font-heading text-micro font-bold uppercase tracking-wider text-slate-400">{t.mitigations.affectedServicesLabel}</span>
              {affectedServiceIds.map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => selectService(id)}
                  className="rounded-md border border-sky-500/40 bg-sky-950/40 px-2 py-1 text-caption font-bold text-sky-200 transition-colors hover:bg-sky-900/50"
                >
                  {services.find((s) => s.id === id)?.name ?? id}
                </button>
              ))}
            </div>
          )}
        </EmptyState>
      ) : (
        <div data-tour="runbook-grid" className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] content-start gap-1.5 overflow-y-auto p-2 pt-1">
          {runbooks.map((rb) => (
            <RunbookCard key={rb.actionId} rb={rb} onRun={execute} />
          ))}
        </div>
      )}
    </div>
  );
}
