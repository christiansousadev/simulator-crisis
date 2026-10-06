import { Music, Music4, Volume2, VolumeX } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ReducedMotionPref, useGameStore } from "../../store/useGameStore";
import LanguageSwitcher from "../common/LanguageSwitcher";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import {
  getAudioSettings,
  getMusicSettings,
  playUiConfirmSound,
  playUiHoverSound,
  setMasterVolume,
  setMusicMuted,
  setMusicVolume,
  setMuted,
} from "../../utils/sound";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-slate-300 cursor-pointer py-1">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-sky-500 w-4 h-4" />
    </label>
  );
}

const MOTION_OPTIONS: ReducedMotionPref[] = ["system", "on", "off"];

// SETTINGS: AUDIO (MASTER MUTE, SFX, MUSIC), ACCESSIBILITY (INCLUDING MOTION), LANGUAGE, SHORTCUTS
export default function SettingsModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.settingsOpen);
  const closeSettings = useGameStore((s) => s.closeSettings);
  const highContrast = useGameStore((s) => s.highContrast);
  const setHighContrast = useGameStore((s) => s.setHighContrast);
  const colorblindSafe = useGameStore((s) => s.colorblindSafe);
  const setColorblindSafe = useGameStore((s) => s.setColorblindSafe);
  const reducedMotionPref = useGameStore((s) => s.reducedMotionPref);
  const setReducedMotionPref = useGameStore((s) => s.setReducedMotionPref);
  const [audio, setAudio] = useState(() => getAudioSettings());
  const [music, setMusic] = useState(() => getMusicSettings());

  // the title screen's mute chip can change these while this dialog is closed
  useEffect(() => {
    if (!open) return;
    setAudio(getAudioSettings());
    setMusic(getMusicSettings());
  }, [open]);

  const handleMasterMute = (next: boolean) => {
    setMuted(next);
    setAudio((prev) => ({ ...prev, muted: next }));
    if (!next) playUiConfirmSound();
  };

  const handleVolumeChange = (value: number) => {
    setMasterVolume(value);
    setAudio((prev) => ({ ...prev, volume: value }));
  };

  const handleMusicVolumeChange = (value: number) => {
    setMusicVolume(value);
    setMusic((prev) => ({ ...prev, volume: value }));
  };

  const handleMusicMute = (next: boolean) => {
    setMusicMuted(next);
    setMusic((prev) => ({ ...prev, muted: next }));
  };

  const motionLabels: Record<ReducedMotionPref, string> = {
    system: t.flow.motionSystem,
    on: t.flow.motionReduced,
    off: t.flow.motionFull,
  };

  const shortcuts: Array<[string, string]> = [
    ["Esc", t.flow.shortcutPause],
    ["Space", t.flow.shortcutRun],
    ["1 · 2 · 5", t.flow.shortcutSpeed],
    ["[ · ]", t.flow.shortcutCycle],
    ["I M C U R A G", t.flow.shortcutTabs],
    ["D", t.flow.shortcutDock],
    ["B", t.flow.shortcutBuild],
  ];

  return (
    <Modal open={open} onClose={closeSettings} title={t.settings.title} size="md" layer="system">
      <ModalHeader title={t.settings.title} onClose={closeSettings} closeLabel={t.settings.close} />

      <ModalBody className="p-5 flex flex-col gap-6">
        <Section title={t.settings.audioSection}>
          <Toggle label={t.flow.muteEverything} checked={audio.muted} onChange={handleMasterMute} />
          <p className="text-[11px] text-slate-500 -mt-0.5 mb-3">{t.flow.muteEverythingHint}</p>

          <div className="flex items-center gap-3">
            <span className="shrink-0 text-slate-300" aria-hidden="true">
              {audio.muted || audio.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              disabled={audio.muted}
              aria-label={t.settings.sfxVolume}
              onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
              className="flex-1 accent-sky-500 disabled:opacity-40"
            />
            <span className="text-[11px] font-mono text-slate-400 w-9 text-right">{Math.round(audio.volume * 100)}%</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 ml-7">{t.settings.sfxVolume}</p>

          <div className="flex items-center gap-3 mt-4">
            <span className="shrink-0 text-slate-300" aria-hidden="true">
              {music.muted || audio.muted || music.volume === 0 ? <Music4 className="w-4 h-4" /> : <Music className="w-4 h-4" />}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={music.volume}
              disabled={music.muted || audio.muted}
              aria-label={t.settings.musicSection}
              onChange={(e) => handleMusicVolumeChange(Number.parseFloat(e.target.value))}
              className="flex-1 accent-sky-500 disabled:opacity-40"
            />
            <span className="text-[11px] font-mono text-slate-400 w-9 text-right">{Math.round(music.volume * 100)}%</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 ml-7">{t.settings.musicSection}</p>
          <Toggle label={t.settings.muteMusic} checked={music.muted} onChange={handleMusicMute} />
        </Section>

        <Section title={t.settings.accessibilitySection}>
          <Toggle label={t.settings.highContrast} checked={highContrast} onChange={setHighContrast} />
          <Toggle label={t.settings.colorblindSafe} checked={colorblindSafe} onChange={setColorblindSafe} />

          <div className="mt-3">
            <p id="motion-label" className="text-xs text-slate-300 mb-1.5">
              {t.flow.motionLabel}
            </p>
            <div role="radiogroup" aria-labelledby="motion-label" className="flex gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              {MOTION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={reducedMotionPref === opt}
                  onMouseEnter={playUiHoverSound}
                  onClick={() => setReducedMotionPref(opt)}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors duration-fast ${
                    reducedMotionPref === opt ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {motionLabels[opt]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">{t.flow.motionHint}</p>
          </div>
        </Section>

        <Section title={t.settings.languageSection}>
          <LanguageSwitcher />
        </Section>

        <Section title={t.flow.shortcutsSection}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {shortcuts.map(([keys, action]) => (
              <div key={keys} className="contents">
                <dt className="font-mono text-[11px] text-sky-300 whitespace-nowrap">{keys}</dt>
                <dd className="text-slate-400">{action}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={closeSettings}
          className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-colors duration-fast"
        >
          {t.settings.close}
        </button>
      </ModalFooter>
    </Modal>
  );
}
