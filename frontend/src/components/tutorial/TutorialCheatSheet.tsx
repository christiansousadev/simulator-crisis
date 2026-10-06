import { useTranslation } from "../../i18n/useTranslation";
import { CAUSE_ORDER, FULL_RESOLUTION_THRESHOLD, MITIGATION_EFFECTIVENESS, RUNBOOK_ORDER } from "./mitigationMatrix";

// RUNBOOK CHEAT SHEET: the 4 runbooks x 4 causes effectiveness matrix straight from the backend
// formulas. Self-contained (no modal chrome) so the pause menu or any panel can mount it as is.
export default function TutorialCheatSheet({ className = "" }: { className?: string }) {
  const t = useTranslation();
  const copy = t.tutorial.cheatSheet;

  return (
    <section className={`text-slate-200 ${className}`} aria-label={copy.title}>
      <h3 className="text-sm font-bold font-heading tracking-wide text-white">{copy.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{copy.intro}</p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {copy.runbookHeader}
              </th>
              {CAUSE_ORDER.map((cause) => (
                <th key={cause} scope="col" className="px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-tight">
                  {copy.causes[cause]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RUNBOOK_ORDER.map((runbook) => (
              <tr key={runbook}>
                <th scope="row" className="px-2 py-1.5 text-left text-xs font-bold text-slate-200">
                  {t.mitigations.actions[runbook].name}
                </th>
                {CAUSE_ORDER.map((cause) => {
                  const value = MITIGATION_EFFECTIVENESS[runbook][cause];
                  const full = value >= FULL_RESOLUTION_THRESHOLD;
                  return (
                    <td
                      key={cause}
                      className={`rounded-md px-1 py-1.5 font-mono font-bold tabular-nums ${
                        full
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-slate-800/70 text-slate-400 border border-slate-700/60"
                      }`}
                    >
                      {Math.round(value * 100)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/60" aria-hidden="true" />
          {copy.legendFull}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-700 border border-slate-600" aria-hidden="true" />
          {copy.legendPartial}
        </span>
      </div>
      <p className="mt-2 text-[11px] italic text-slate-500">{copy.tip}</p>
    </section>
  );
}
