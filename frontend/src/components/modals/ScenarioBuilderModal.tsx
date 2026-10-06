import { Clipboard, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { ReactNode, useId, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { ChaosInjectionConfig, CustomScenarioConfig } from "../../types/game";
import { launchCustomScenario } from "../../utils/launchFlow";
import {
  CONFIG_LIMITS,
  ConfigError,
  decodeChallengeCode,
  DEFAULT_CUSTOM_CONFIG,
  encodeChallengeCode,
  SERVICE_IDS,
  STARTING_DEFAULTS,
  validateConfig,
} from "../../utils/scenarioConfig";
import { playErrorSound, playSuccessSound, playUiConfirmSound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";

interface SliderFieldProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  error?: string;
  hint?: string;
}

// LABELLED RANGE SLIDER WITH ITS LIVE VALUE AND AN INLINE VALIDATION MESSAGE
function SliderField({ label, value, display, min, max, step, onChange, error, hint }: SliderFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs text-slate-300">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm font-bold text-sky-300">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        className="w-full accent-sky-500"
      />
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-[11px] text-rose-400">
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-slate-500">{hint}</p>
      )}
    </div>
  );
}

interface OptionalSliderProps extends Omit<SliderFieldProps, "value" | "display"> {
  // undefined = "use the difficulty default"; a number = the player's own value
  value: number | undefined;
  display: (value: number) => string;
  defaultText: string;
  seed: number;
  toggleLabel: string;
  onToggle: (value: number | undefined) => void;
}

// A SLIDER THAT CAN BE SWITCHED OFF IN FAVOUR OF THE DIFFICULTY DEFAULT
function OptionalSliderField({ value, display, defaultText, seed, toggleLabel, onToggle, ...slider }: OptionalSliderProps) {
  const toggleId = useId();
  const useDefault = value === undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        {/* with a custom value the slider below carries the label itself */}
        <span className="text-xs text-slate-300">{useDefault ? slider.label : ""}</span>
        <label htmlFor={toggleId} className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
          <input
            id={toggleId}
            type="checkbox"
            checked={useDefault}
            onChange={(e) => onToggle(e.target.checked ? undefined : seed)}
            className="accent-sky-500"
          />
          {toggleLabel}
        </label>
      </div>
      {useDefault ? <p className="font-mono text-sm text-slate-400">{defaultText}</p> : <SliderField {...slider} value={value} display={display(value)} />}
    </div>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-3.5">{children}</div>;
}

// CUSTOM CHAOS SANDBOX BUILDER: DURATION, HAZARD, BUDGET FLOOR AND SCHEDULED CHAOS INJECTIONS
export default function ScenarioBuilderModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.scenarioBuilderOpen);
  const close = useGameStore((s) => s.closeScenarioBuilder);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [config, setConfig] = useState<CustomScenarioConfig>(DEFAULT_CUSTOM_CONFIG);
  const [importCode, setImportCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const errors = validateConfig(config);
  const has = (field: ConfigError["field"], index?: number) =>
    errors.some((e) => e.field === field && (index === undefined || ("index" in e && e.index === index)));

  const serviceName = (id: string) => t.flow.serviceNames[id] ?? id;

  const addInjection = () => {
    setConfig((c) => {
      if (c.chaos_injections.length >= CONFIG_LIMITS.maxInjections) return c;
      // default just inside the window so the new row is valid straight away
      const at_tick = Math.min(10, Math.max(0, c.duration_ticks - 1));
      return { ...c, chaos_injections: [...c.chaos_injections, { at_tick, service_id: SERVICE_IDS[0] }] };
    });
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
    try {
      await navigator.clipboard.writeText(encodeChallengeCode(config));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: the code can still be copied from the import box below
      setImportCode(encodeChallengeCode(config));
    }
  };

  const handleImport = () => {
    const decoded = decodeChallengeCode(importCode);
    if (decoded) {
      setConfig(decoded);
      playSuccessSound();
      pushFloatingText(t.scenarioBuilder.importSuccess, "success");
    } else {
      playErrorSound();
      pushFloatingText(t.scenarioBuilder.importFailed, "danger");
    }
  };

  const handleTest = async () => {
    if (errors.length > 0 || busy) return;
    playUiConfirmSound();
    setBusy(true);
    const ok = await launchCustomScenario(config, t.flow.customScenario);
    setBusy(false);
    // the launch flow closes this dialog on success; on failure it already raised the error toast
    if (!ok) pushFloatingText(t.scenarioBuilder.testFailed, "danger");
  };

  return (
    <Modal open={open} onClose={close} title={t.scenarioBuilder.title} size="lg" layer="system">
      <ModalHeader title={t.scenarioBuilder.title} onClose={close} closeLabel={t.common.close} />

      <ModalBody className="p-5 flex flex-col gap-3.5 text-sm">
        <Field>
          <SliderField
            label={t.scenarioBuilder.durationTicks}
            value={config.duration_ticks}
            display={t.flow.durationLabel(config.duration_ticks, Math.max(1, Math.ceil(config.duration_ticks / 24)))}
            {...CONFIG_LIMITS.duration}
            onChange={(v) => setConfig((c) => ({ ...c, duration_ticks: v }))}
            error={has("duration") ? t.flow.errDuration : undefined}
          />
        </Field>
        <Field>
          <SliderField
            label={t.scenarioBuilder.hazardMultiplier}
            value={config.hazard_multiplier}
            display={`${config.hazard_multiplier.toFixed(1)}x`}
            {...CONFIG_LIMITS.hazard}
            onChange={(v) => setConfig((c) => ({ ...c, hazard_multiplier: v }))}
            error={has("hazard") ? t.flow.errHazard : undefined}
            hint={t.flow.hintHazard}
          />
        </Field>
        <Field>
          <SliderField
            label={t.scenarioBuilder.budgetFloor}
            value={config.budget_floor}
            display={`$${config.budget_floor.toLocaleString()}`}
            {...CONFIG_LIMITS.budgetFloor}
            onChange={(v) => setConfig((c) => ({ ...c, budget_floor: v }))}
            error={has("budgetFloor") ? t.flow.errBudgetFloor : undefined}
            hint={t.flow.hintBudgetFloor}
          />
        </Field>
        <Field>
          <OptionalSliderField
            label={t.uiGaps.builder.startingBudget}
            value={config.starting_budget}
            display={(v) => `$${v.toLocaleString()}`}
            defaultText={t.uiGaps.builder.defaultBudget(`$${STARTING_DEFAULTS.budget.toLocaleString()}`)}
            seed={STARTING_DEFAULTS.budget}
            toggleLabel={t.uiGaps.builder.useDefault}
            min={CONFIG_LIMITS.startingBudget.min}
            max={CONFIG_LIMITS.startingBudget.max}
            step={CONFIG_LIMITS.startingBudget.step}
            onToggle={(v) => setConfig((c) => ({ ...c, starting_budget: v }))}
            onChange={(v) => setConfig((c) => ({ ...c, starting_budget: v }))}
            error={
              has("startingBudgetRange")
                ? t.uiGaps.builder.errBudgetRange
                : has("startingBudgetFloor")
                  ? t.uiGaps.builder.errBudgetAboveFloor(`$${config.budget_floor.toLocaleString()}`)
                  : undefined
            }
          />
        </Field>
        <Field>
          <OptionalSliderField
            label={t.uiGaps.builder.startingTechDebt}
            value={config.starting_tech_debt}
            display={(v) => String(v)}
            defaultText={t.uiGaps.builder.defaultTechDebt(STARTING_DEFAULTS.techDebt)}
            seed={STARTING_DEFAULTS.techDebt}
            toggleLabel={t.uiGaps.builder.useDefault}
            {...CONFIG_LIMITS.startingTechDebt}
            onToggle={(v) => setConfig((c) => ({ ...c, starting_tech_debt: v }))}
            onChange={(v) => setConfig((c) => ({ ...c, starting_tech_debt: Math.round(v) }))}
            error={has("startingTechDebt") ? t.uiGaps.builder.errTechDebt : undefined}
            hint={t.uiGaps.builder.hintTechDebt}
          />
        </Field>

        <Field>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-300">
              {t.scenarioBuilder.chaosInjections}{" "}
              <span className="font-mono text-slate-500">
                ({config.chaos_injections.length}/{CONFIG_LIMITS.maxInjections})
              </span>
            </span>
            <button
              type="button"
              onClick={addInjection}
              disabled={config.chaos_injections.length >= CONFIG_LIMITS.maxInjections}
              className="flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t.scenarioBuilder.addInjection}
            </button>
          </div>
          {config.chaos_injections.length === 0 && <p className="text-[11px] text-slate-500">{t.flow.noInjections}</p>}
          <ul className="flex flex-col gap-2">
            {config.chaos_injections.map((inj, i) => {
              const tickBad = has("injectionTick", i);
              return (
                <li key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400 w-16 shrink-0">
                      {t.flow.atTick(inj.at_tick)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, config.duration_ticks - 1)}
                      step={1}
                      value={Math.min(inj.at_tick, Math.max(1, config.duration_ticks - 1))}
                      aria-label={`${t.flow.injectionTime} ${i + 1}`}
                      aria-invalid={tickBad}
                      onChange={(e) => updateInjection(i, { at_tick: Number.parseInt(e.target.value, 10) })}
                      className="flex-1 min-w-0 accent-sky-500"
                    />
                    <select
                      value={inj.service_id}
                      aria-label={`${t.flow.injectionTarget} ${i + 1}`}
                      onChange={(e) => updateInjection(i, { service_id: e.target.value })}
                      className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-white text-xs"
                    >
                      {SERVICE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {serviceName(id)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeInjection(i)}
                      aria-label={`${t.flow.removeInjection} ${i + 1}`}
                      className="p-1 text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  {tickBad && (
                    <p role="alert" className="text-[11px] text-rose-400 pl-[4.5rem]">
                      {t.flow.errInjectionTick(config.duration_ticks)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Field>

        <Field>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 text-xs font-bold hover:bg-slate-800"
            >
              {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> : <Clipboard className="w-3.5 h-3.5" aria-hidden="true" />}
              {copied ? t.flow.copied : t.scenarioBuilder.exportCode}
            </button>
            <div className="flex items-center gap-2">
              <input
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                aria-label={t.scenarioBuilder.importCode}
                placeholder={t.scenarioBuilder.importPlaceholder}
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-white text-xs"
              />
              <button
                type="button"
                onClick={handleImport}
                disabled={importCode.trim() === ""}
                className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 text-xs font-bold hover:bg-slate-800 disabled:opacity-40"
              >
                {t.scenarioBuilder.importCode}
              </button>
            </div>
          </div>
        </Field>
      </ModalBody>

      <ModalFooter className="justify-between">
        <span role="status" className={`text-[11px] ${errors.length > 0 ? "text-rose-400" : "text-slate-500"}`}>
          {errors.length > 0 ? t.flow.fixErrors(errors.length) : t.flow.configValid}
        </span>
        <button
          type="button"
          onClick={handleTest}
          disabled={errors.length > 0 || busy}
          className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-bold transition-colors duration-fast"
        >
          {t.scenarioBuilder.testScenario}
        </button>
      </ModalFooter>
    </Modal>
  );
}
