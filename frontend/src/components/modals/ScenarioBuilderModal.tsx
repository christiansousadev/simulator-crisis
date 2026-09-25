import { Clipboard, ClipboardCheck, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { ChaosInjectionConfig, CustomScenarioConfig } from "../../types/game";
import { playClickSound } from "../../utils/sound";

const DEFAULT_CONFIG: CustomScenarioConfig = {
  duration_ticks: 60,
  hazard_multiplier: 1.5,
  budget_floor: 20000,
  chaos_injections: [],
};

const SERVICE_IDS = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];

// ENCODE A CONFIG AS A SHAREABLE BASE64 CHALLENGE CODE
function encodeChallengeCode(config: CustomScenarioConfig): string {
  return btoa(JSON.stringify(config));
}

// DECODE A SHARED CHALLENGE CODE BACK INTO A CONFIG, OR NULL IF MALFORMED
function decodeChallengeCode(code: string): CustomScenarioConfig | null {
  try {
    return JSON.parse(atob(code.trim())) as CustomScenarioConfig;
  } catch {
    return null;
  }
}

// CUSTOM CHAOS SANDBOX BUILDER: TRAFFIC, HAZARD, BUDGET FLOOR AND SCHEDULED CHAOS INJECTIONS
export default function ScenarioBuilderModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.scenarioBuilderOpen);
  const close = useGameStore((s) => s.closeScenarioBuilder);
  const closeScenarioSelect = useGameStore((s) => s.closeScenarioSelect);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [config, setConfig] = useState<CustomScenarioConfig>(DEFAULT_CONFIG);
  const [importCode, setImportCode] = useState("");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const addInjection = () => {
    setConfig((c) => ({ ...c, chaos_injections: [...c.chaos_injections, { at_tick: 10, service_id: SERVICE_IDS[0] }] }));
  };
  const updateInjection = (index: number, patch: Partial<ChaosInjectionConfig>) => {
    setConfig((c) => ({
      ...c,
      chaos_injections: c.chaos_injections.map((inj, i) => (i === index ? { ...inj, ...patch } : inj)),
    }));
  };
  const removeInjection = (index: number) => {
    setConfig((c) => ({ ...c, chaos_injections: c.chaos_injections.filter((_, i) => i !== index) }));
  };

  const handleExport = async () => {
    const code = encodeChallengeCode(config);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; the code is still visible for manual copy in a future revision
    }
  };

  const handleImport = () => {
    const decoded = decodeChallengeCode(importCode);
    if (decoded) {
      setConfig(decoded);
      pushFloatingText(t.scenarioBuilder.importSuccess, "success");
    } else {
      pushFloatingText(t.scenarioBuilder.importFailed, "danger");
    }
  };

  const handleTest = async () => {
    playClickSound();
    try {
      await api.loadCustomScenario(config);
      close();
      closeScenarioSelect();
    } catch {
      pushFloatingText(t.scenarioBuilder.testFailed, "danger");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in">
      <div className="w-full max-w-lg max-h-[85vh] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-modal-in">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60 shrink-0">
          <h2 className="text-sm font-bold font-heading text-white">{t.scenarioBuilder.title}</h2>
          <button onClick={close} className="text-slate-400 hover:text-slate-100" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            {t.scenarioBuilder.durationTicks}
            <input
              type="number"
              min={10}
              value={config.duration_ticks}
              onChange={(e) => setConfig((c) => ({ ...c, duration_ticks: Number.parseInt(e.target.value, 10) || 0 }))}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            {t.scenarioBuilder.hazardMultiplier}
            <input
              type="number"
              step={0.1}
              min={0}
              value={config.hazard_multiplier}
              onChange={(e) => setConfig((c) => ({ ...c, hazard_multiplier: Number.parseFloat(e.target.value) || 0 }))}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            {t.scenarioBuilder.budgetFloor}
            <input
              type="number"
              min={0}
              value={config.budget_floor}
              onChange={(e) => setConfig((c) => ({ ...c, budget_floor: Number.parseFloat(e.target.value) || 0 }))}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-white"
            />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-300">{t.scenarioBuilder.chaosInjections}</span>
              <button onClick={addInjection} className="flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300">
                <Plus className="w-3.5 h-3.5" />
                {t.scenarioBuilder.addInjection}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {config.chaos_injections.map((inj, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number"
                    value={inj.at_tick}
                    onChange={(e) => updateInjection(i, { at_tick: Number.parseInt(e.target.value, 10) || 0 })}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs"
                  />
                  <select
                    value={inj.service_id}
                    onChange={(e) => updateInjection(i, { service_id: e.target.value })}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs"
                  >
                    {SERVICE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => removeInjection(i)} className="text-rose-400 hover:text-rose-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4 flex flex-col gap-2">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 text-xs font-bold hover:bg-slate-800"
            >
              {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
              {t.scenarioBuilder.exportCode}
            </button>
            <div className="flex items-center gap-2">
              <input
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                placeholder={t.scenarioBuilder.importPlaceholder}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-white text-xs"
              />
              <button onClick={handleImport} className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 text-xs font-bold hover:bg-slate-800">
                {t.scenarioBuilder.importCode}
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 shrink-0">
          <button
            onClick={handleTest}
            className="w-full px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold transition-colors"
          >
            {t.scenarioBuilder.testScenario}
          </button>
        </div>
      </div>
    </div>
  );
}
