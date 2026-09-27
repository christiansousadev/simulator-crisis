// lightweight web audio synth effects, no external audio files required

type OscType = OscillatorNode["type"];

interface ToneStep {
  freq: number;
  type?: OscType;
  start: number;
  duration: number;
  gain?: number;
}

const VOLUME_STORAGE_KEY = "incidentzero.audio_volume";
const MUTED_STORAGE_KEY = "incidentzero.audio_muted";
const MUSIC_VOLUME_STORAGE_KEY = "incidentzero.music_volume";
const MUSIC_MUTED_STORAGE_KEY = "incidentzero.music_muted";

// PERSISTED MASTER AUDIO SETTINGS, LOADED ONCE AT MODULE INIT
function loadStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsed = raw === null ? 1 : Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
  } catch {
    return 1;
  }
}

function loadStoredMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let masterVolume = typeof window === "undefined" ? 1 : loadStoredVolume();
let muted = typeof window === "undefined" ? false : loadStoredMuted();

// READ THE CURRENT MASTER VOLUME (0-1) AND MUTE STATE
export function getAudioSettings(): { volume: number; muted: boolean } {
  return { volume: masterVolume, muted };
}

// SET MASTER SFX VOLUME (0-1), PERSISTED ACROSS SESSIONS
export function setMasterVolume(volume: number) {
  masterVolume = Math.max(0, Math.min(1, volume));
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(masterVolume));
  } catch {
    // best-effort only
  }
}

// TOGGLE MASTER MUTE, PERSISTED ACROSS SESSIONS
export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, String(muted));
  } catch {
    // best-effort only
  }
}

export type MusicTension = "calm" | "tense" | "critical";

interface MusicEngineState {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  oscillators: OscillatorNode[];
  lfo: OscillatorNode | null;
  tension: MusicTension;
}

// three hand-picked triads, each darker than the last, for the generative ambient pad
const MUSIC_CHORDS: Record<MusicTension, number[]> = {
  calm: [130.81, 164.81, 196.0],
  tense: [130.81, 155.56, 196.0],
  critical: [123.47, 146.83, 174.61],
};

let musicEngine: MusicEngineState = { ctx: null, masterGain: null, oscillators: [], lfo: null, tension: "calm" };

let musicVolume = typeof window === "undefined" ? 0.5 : loadStoredMusicVolume();
let musicMuted = typeof window === "undefined" ? false : loadStoredMusicMuted();

function loadStoredMusicVolume(): number {
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
    const parsed = raw === null ? 0.5 : Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.5;
  } catch {
    return 0.5;
  }
}

function loadStoredMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// READ THE CURRENT MUSIC VOLUME (0-1) AND MUTE STATE
export function getMusicSettings(): { volume: number; muted: boolean } {
  return { volume: musicVolume, muted: musicMuted };
}

// SET AMBIENT MUSIC VOLUME (0-1), PERSISTED ACROSS SESSIONS, APPLIED LIVE IF PLAYING
export function setMusicVolume(volume: number) {
  musicVolume = Math.max(0, Math.min(1, volume));
  try {
    localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(musicVolume));
  } catch {
    // best-effort only
  }
  applyMusicGain();
}

// TOGGLE MUSIC MUTE, PERSISTED ACROSS SESSIONS, APPLIED LIVE IF PLAYING
export function setMusicMuted(next: boolean) {
  musicMuted = next;
  try {
    localStorage.setItem(MUSIC_MUTED_STORAGE_KEY, String(musicMuted));
  } catch {
    // best-effort only
  }
  applyMusicGain();
}

// RAMP THE MUSIC BUS TOWARD ITS TARGET GAIN, KEPT QUIET UNDER THE SFX BUS
function applyMusicGain() {
  if (!musicEngine.masterGain || !musicEngine.ctx) return;
  const target = musicMuted ? 0 : musicVolume * 0.16;
  musicEngine.masterGain.gain.linearRampToValueAtTime(target, musicEngine.ctx.currentTime + 0.8);
}

// START THE PROCEDURAL AMBIENT PAD LOOP; BROWSERS REQUIRE THIS TO FOLLOW A USER GESTURE
export function startAmbientMusic() {
  if (musicEngine.ctx) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    // slow lfo wobbles each voice's amplitude so the pad breathes instead of droning flat
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfo.start();

    const oscillators = MUSIC_CHORDS.calm.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.33;
      lfoGain.connect(voiceGain.gain);
      osc.connect(voiceGain);
      voiceGain.connect(masterGain);
      osc.start();
      return osc;
    });

    musicEngine = { ctx, masterGain, oscillators, lfo, tension: "calm" };
    applyMusicGain();
  } catch {
    // audio unsupported or blocked by browser policy; the game remains fully playable without it
  }
}

// STOP AND TEAR DOWN THE AMBIENT MUSIC LOOP
export function stopAmbientMusic() {
  if (!musicEngine.ctx) return;
  try {
    musicEngine.oscillators.forEach((osc) => osc.stop());
    musicEngine.lfo?.stop();
    musicEngine.ctx.close();
  } catch {
    // already stopped or unsupported
  }
  musicEngine = { ctx: null, masterGain: null, oscillators: [], lfo: null, tension: "calm" };
}

// RETUNE THE AMBIENT PAD'S CHORD TO REFLECT CURRENT GAME TENSION
export function setMusicTension(tension: MusicTension) {
  if (!musicEngine.ctx || musicEngine.tension === tension) return;
  const ctx = musicEngine.ctx;
  musicEngine.tension = tension;
  const freqs = MUSIC_CHORDS[tension];
  musicEngine.oscillators.forEach((osc, i) => {
    osc.frequency.linearRampToValueAtTime(freqs[i], ctx.currentTime + 1.2);
  });
}

// WHETHER THE AMBIENT MUSIC LOOP IS CURRENTLY RUNNING
export function isMusicPlaying(): boolean {
  return musicEngine.ctx !== null;
}

// PLAY A SEQUENCE OF SYNTHESIZED TONE STEPS THROUGH A SHARED AUDIO CONTEXT
function playToneSequence(steps: ToneStep[]) {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    let latestEnd = now;

    for (const step of steps) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = step.type ?? "sine";
      oscillator.frequency.value = step.freq;

      const startAt = now + step.start;
      const endAt = startAt + step.duration;
      const peakGain = (step.gain ?? 0.08) * masterVolume;
      gainNode.gain.setValueAtTime(peakGain, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endAt);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt);
      latestEnd = Math.max(latestEnd, endAt);
    }

    setTimeout(() => ctx.close(), (latestEnd - now) * 1000 + 100);
  } catch {
    // audio unsupported or blocked by browser autoplay policy; fail silently
  }
}

// GENTLE MECHANICAL CLICK FOR DIRECTIVE BUTTON PRESSES
export function playClickSound() {
  playToneSequence([{ freq: 620, type: "square", start: 0, duration: 0.05, gain: 0.05 }]);
}

// KA-CHING CASH DEDUCTION TONE FOR A SUCCESSFUL MITIGATION SPEND
export function playCashSound() {
  playToneSequence([
    { freq: 880, type: "triangle", start: 0, duration: 0.09, gain: 0.09 },
    { freq: 1320, type: "triangle", start: 0.07, duration: 0.14, gain: 0.09 },
  ]);
}

// SOFT EMERGENCY SIREN CHIRP WHEN A NEW INCIDENT SPAWNS
export function playIncidentChirp(critical: boolean) {
  playToneSequence([{ freq: critical ? 880 : 660, type: "square", start: 0, duration: 0.35, gain: 0.08 }]);
}

// UPLIFTING CHIME WHEN A NODE RETURNS TO HEALTHY
export function playRestoredChime() {
  playToneSequence([
    { freq: 660, type: "sine", start: 0, duration: 0.18, gain: 0.08 },
    { freq: 880, type: "sine", start: 0.1, duration: 0.24, gain: 0.08 },
  ]);
}

// SOLEMN BOARDROOM CHIME WHEN A CAB DILEMMA IS OFFERED
export function playDilemmaChime() {
  playToneSequence([
    { freq: 440, type: "sine", start: 0, duration: 0.22, gain: 0.07 },
    { freq: 330, type: "sine", start: 0.18, duration: 0.3, gain: 0.07 },
  ]);
}

// SOFT CLICK FOR OPENING A MODAL OR PANEL, QUIETER THAN THE DIRECTIVE BUTTON CLICK
export function playUiOpenSound() {
  playToneSequence([{ freq: 480, type: "sine", start: 0, duration: 0.06, gain: 0.04 }]);
}

// TRIUMPHANT ASCENDING FANFARE FOR SURVIVING THE FULL MONTHLY AUDIT CYCLE
export function playVictoryFanfare() {
  playToneSequence([
    { freq: 523.25, type: "triangle", start: 0, duration: 0.16, gain: 0.1 },
    { freq: 659.25, type: "triangle", start: 0.14, duration: 0.16, gain: 0.1 },
    { freq: 783.99, type: "triangle", start: 0.28, duration: 0.16, gain: 0.1 },
    { freq: 1046.5, type: "triangle", start: 0.42, duration: 0.4, gain: 0.12 },
    { freq: 783.99, type: "sine", start: 0.42, duration: 0.4, gain: 0.06 },
  ]);
}

// GRAVE DESCENDING STING FOR BANKRUPTCY LIQUIDATION
export function playDefeatSting() {
  playToneSequence([
    { freq: 220, type: "sawtooth", start: 0, duration: 0.22, gain: 0.09 },
    { freq: 174.61, type: "sawtooth", start: 0.18, duration: 0.22, gain: 0.09 },
    { freq: 130.81, type: "sawtooth", start: 0.36, duration: 0.5, gain: 0.11 },
  ]);
}

// RETRO ARCADE COIN/CASH-REGISTER JINGLE FOR A SURVIVED CYCLE OR A JUICY POSITIVE PAYOUT
export function playChaChing() {
  playToneSequence([
    { freq: 988, type: "square", start: 0, duration: 0.06, gain: 0.07 },
    { freq: 1319, type: "square", start: 0.055, duration: 0.09, gain: 0.08 },
    { freq: 1568, type: "square", start: 0.13, duration: 0.16, gain: 0.09 },
  ]);
}

// FRANTIC MECHANICAL-KEYBOARD CLATTER, PLAYED WHILE A RUNBOOK IS BEING APPLIED
export function playKeyboardClatter() {
  const steps: ToneStep[] = [];
  const clacks = 8;
  for (let i = 0; i < clacks; i++) {
    steps.push({
      freq: 1800 + Math.random() * 1400,
      type: "square",
      start: i * 0.055 + Math.random() * 0.02,
      duration: 0.02,
      gain: 0.025,
    });
  }
  playToneSequence(steps);
}

// TWO-TONE ROTARY EMERGENCY SIREN, ONE SWEEP CYCLE -- CALL AGAIN ON A LOOP WHILE A P1 IS ACTIVE
export function playRedAlertSiren() {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(500, now);
    oscillator.frequency.linearRampToValueAtTime(900, now + 0.5);
    oscillator.frequency.linearRampToValueAtTime(500, now + 1.0);
    const peak = 0.05 * masterVolume;
    gainNode.gain.setValueAtTime(peak, now);
    gainNode.gain.setValueAtTime(peak, now + 0.95);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + 1.0);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.0);
    setTimeout(() => ctx.close(), 1100);
  } catch {
    // audio unsupported or blocked; the alarm stays purely visual
  }
}

// TENSE, SUBTLE CARDIAC-MONITOR BEEP FOR WHEN THE RUNWAY IS NEARLY EXHAUSTED
export function playCriticalHeartbeat() {
  playToneSequence([
    { freq: 1000, type: "sine", start: 0, duration: 0.08, gain: 0.05 },
    { freq: 1000, type: "sine", start: 0.16, duration: 0.08, gain: 0.05 },
  ]);
}
