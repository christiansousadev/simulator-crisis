import { Music, Music4, Volume2, VolumeX, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import LanguageSwitcher from "../common/LanguageSwitcher";
import {
  getAudioSettings,
  getMusicSettings,
  playClickSound,
  setMasterVolume,
  setMusicMuted,
  setMusicVolume,
  setMuted,
} from "../../utils/sound";

// SETTINGS DRAWER: SFX VOLUME, MUSIC VOLUME, ACCESSIBILITY TOGGLES AND LANGUAGE SELECTION
export default function SettingsModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.settingsOpen);
  const closeSettings = useGameStore((s) => s.closeSettings);
  const highContrast = useGameStore((s) => s.highContrast);
  const setHighContrast = useGameStore((s) => s.setHighContrast);
  const colorblindSafe = useGameStore((s) => s.colorblindSafe);
  const setColorblindSafe = useGameStore((s) => s.setColorblindSafe);
  const [audio, setAudio] = useState(() => getAudioSettings());
  const [music, setMusic] = useState(() => getMusicSettings());

  if (!open) return null;

  const handleVolumeChange = (value: number) => {
    setMasterVolume(value);
    setAudio((prev) => ({ ...prev, volume: value }));
  };

  const handleMuteToggle = () => {
    const next = !audio.muted;
    setMuted(next);
    setAudio((prev) => ({ ...prev, muted: next }));
    if (!next) playClickSound();
  };

  const handleMusicVolumeChange = (value: number) => {
    setMusicVolume(value);
    setMusic((prev) => ({ ...prev, volume: value }));
  };

  const handleMusicMuteToggle = () => {
    const next = !music.muted;
    setMusicMuted(next);
    setMusic((prev) => ({ ...prev, muted: next }));
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={closeSettings}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60 shrink-0">
          <h2 className="text-sm font-bold text-white">{t.settings.title}</h2>
          <button onClick={closeSettings} className="text-slate-400 hover:text-slate-100 transition-colors" title={t.settings.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-3">{t.settings.audioSection}</h3>

            <div className="flex items-center gap-3">
              <button onClick={handleMuteToggle} className="shrink-0 text-slate-300 hover:text-white transition-colors" title={t.settings.muteAll}>
                {audio.muted || audio.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audio.volume}
                disabled={audio.muted}
                onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
                className="flex-1 accent-sky-500 disabled:opacity-40"
              />
              <span className="text-[11px] font-mono text-slate-400 w-9 text-right">{Math.round(audio.volume * 100)}%</span>
            </div>
            <label className="flex items-center justify-between mt-2 text-xs text-slate-300 cursor-pointer">
              {t.settings.muteAll}
              <input type="checkbox" checked={audio.muted} onChange={handleMuteToggle} className="accent-sky-500 w-4 h-4" />
            </label>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-3">{t.settings.musicSection}</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handleMusicMuteToggle}
                className="shrink-0 text-slate-300 hover:text-white transition-colors"
                title={t.settings.muteMusic}
              >
                {music.muted || music.volume === 0 ? <Music4 className="w-4 h-4" /> : <Music className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={music.volume}
                disabled={music.muted}
                onChange={(e) => handleMusicVolumeChange(Number.parseFloat(e.target.value))}
                className="flex-1 accent-sky-500 disabled:opacity-40"
              />
              <span className="text-[11px] font-mono text-slate-400 w-9 text-right">{Math.round(music.volume * 100)}%</span>
            </div>
            <label className="flex items-center justify-between mt-2 text-xs text-slate-300 cursor-pointer">
              {t.settings.muteMusic}
              <input type="checkbox" checked={music.muted} onChange={handleMusicMuteToggle} className="accent-sky-500 w-4 h-4" />
            </label>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-3">{t.settings.accessibilitySection}</h3>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer py-1">
              {t.settings.highContrast}
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="accent-sky-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer py-1">
              {t.settings.colorblindSafe}
              <input
                type="checkbox"
                checked={colorblindSafe}
                onChange={(e) => setColorblindSafe(e.target.checked)}
                className="accent-sky-500 w-4 h-4"
              />
            </label>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-3">{t.settings.languageSection}</h3>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}
