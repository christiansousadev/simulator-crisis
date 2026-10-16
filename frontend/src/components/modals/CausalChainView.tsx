import { ArrowRight, Lightbulb } from "lucide-react";
import { Fragment, memo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import type { CausalChain } from "../../types/game";

function Node({ label, tone, children }: { label: string; tone: string; children: React.ReactNode }) {
  return (
    <li className={`flex min-w-[9rem] flex-1 flex-col gap-1 rounded-lg border px-3 py-2 ${tone}`}>
      <span className="text-micro font-bold uppercase tracking-wider opacity-80">{label}</span>
      <div className="text-xs font-semibold leading-snug">{children}</div>
    </li>
  );
}

// "WHY IT FAILED": cause -> failed service -> services downstream -> customer impact, plus which
// runbook fits the cause. Every fact comes from the backend's causal_chain (the same frozen dossier the
// report uses); the view only lays it out and attaches the plain-language explanation.
export default memo(function CausalChainView({ chain }: { chain: CausalChain | null }) {
  const t = useTranslation();
  const copy = t.evolution.causal;
  const services = useGameStore((s) => s.telemetry.services);
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? t.flow.serviceNames[id] ?? id;
  const runbookName = (id: string) => t.mitigations.actions[id as keyof typeof t.mitigations.actions]?.name ?? id;

  if (!chain) return <p className="text-sm text-slate-400">{copy.notConfirmed}</p>;

  const category = chain.cause_category ? copy.categories[chain.cause_category] : null;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-bold text-white">{copy.title}</h3>
        <p className="text-xs text-slate-400">{copy.intro}</p>
      </div>

      <ol className="flex flex-wrap items-stretch gap-2" aria-label={copy.title}>
        <Node label={copy.nodeCause} tone="border-amber-500/40 bg-amber-500/5 text-amber-100">
          {category ? category.name : copy.notConfirmed}
        </Node>
        <Fragment>
          <li aria-hidden className="flex items-center text-slate-500">
            <ArrowRight className="h-4 w-4" />
          </li>
          <Node label={copy.nodeService} tone="border-rose-500/40 bg-rose-500/5 text-rose-100">
            {nameOf(chain.service_id)}
          </Node>
          <li aria-hidden className="flex items-center text-slate-500">
            <ArrowRight className="h-4 w-4" />
          </li>
          <Node label={copy.nodeDownstream} tone="border-orange-500/40 bg-orange-500/5 text-orange-100">
            {chain.downstream_service_ids.length > 0 ? chain.downstream_service_ids.map(nameOf).join(" → ") : copy.noDownstream}
          </Node>
          <li aria-hidden className="flex items-center text-slate-500">
            <ArrowRight className="h-4 w-4" />
          </li>
          <Node label={copy.nodeImpact} tone="border-slate-600 bg-slate-800/50 text-slate-200">
            {copy.impactBody}
          </Node>
        </Fragment>
      </ol>

      {category && <p className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-300">{category.why}</p>}

      <ul className="space-y-1 text-xs text-slate-300">
        {chain.best_runbook_id && <li>{copy.bestRunbook(runbookName(chain.best_runbook_id))}</li>}
        <li>{chain.runbooks_used.length > 0 ? copy.usedRunbooks(chain.runbooks_used.join(", ")) : copy.noRunbook}</li>
      </ul>

      <p className="flex items-start gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-cyan-100">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {copy.lesson}
      </p>
    </div>
  );
});
