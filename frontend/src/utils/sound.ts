// synthesized sound effects and music, no external audio files required. the shared audio graph
// lives in audioEngine.ts and the layered music in musicEngine.ts; this file is the public api
// the game imports (names are stable) plus the definition of every individual sound.

import {
  allowRate,
  getEngineDebug,
  getSfxOutput,
  playNoise,
  playTone,
  silenceLoop,
  trackSource,
  type AudioEngineDebug,
  type SfxBus,
  type ToneOptions,
} from "./audioEngine";
import { duckMusic, getMusicDebug, type MusicDebug } from "./musicEngine";

export {
  getAudioSettings,
  getMusicSettings,
  isAudioMuted,
  setAudioMuted,
  setMasterVolume,
  setMusicMuted,
  setMusicVolume,
  setMuted,
  unlockAudio,
} from "./audioEngine";
export {
  duckMusic,
  isMusicPlaying,
  setMusicDefcon,
  setMusicMode,
  setMusicTension,
  startAmbientMusic,
  stopAmbientMusic,
} from "./musicEngine";
export type { DefconInput, MusicMode, MusicTension } from "./musicEngine";

// CURRENT AUDIO STATE FOR TESTS AND DIAGNOSTICS
export function getAudioDebug(): AudioEngineDebug & { music: MusicDebug } {
  return { ...getEngineDebug(), music: getMusicDebug() };
}

type ToneStep = Omit<ToneOptions, "start"> & { start: number };

function playToneSequence(steps: ToneStep[], bus: SfxBus = "sfx") {
  for (const step of steps) playTone({ bus, ...step });
}

// a short high-passed noise tick, the "plastic" part of clicks and keystrokes
function clickNoise(gain: number, freq = 3000, duration = 0.015, bus: SfxBus = "sfx", start = 0) {
  playNoise({ start, duration, gain, filter: { type: "highpass", freq }, bus });
}

// GENTLE MECHANICAL CLICK FOR DIRECTIVE BUTTON PRESSES
export function playClickSound() {
  playToneSequence([{ freq: 620, type: "square", start: 0, duration: 0.05, gain: 0.05 }]);
  clickNoise(0.03);
}

// KA-CHING CASH DEDUCTION TONE FOR A SUCCESSFUL MITIGATION SPEND
export function playCashSound() {
  playToneSequence([
    { freq: 880, type: "triangle", start: 0, duration: 0.09, gain: 0.09 },
    { freq: 1320, type: "triangle", start: 0.07, duration: 0.14, gain: 0.09 },
    { freq: 2640, type: "sine", start: 0.07, duration: 0.2, gain: 0.015 },
  ]);
}

// SOFT EMERGENCY SIREN CHIRP WHEN A NEW INCIDENT SPAWNS
export function playIncidentChirp(critical: boolean) {
  playToneSequence([
    {
      freq: critical ? 880 : 660,
      type: "square",
      start: 0,
      duration: 0.35,
      gain: 0.08,
      filter: { type: "lowpass", freq: 3200 },
    },
  ]);
}

// UPLIFTING CHIME WHEN A NODE RETURNS TO HEALTHY
export function playRestoredChime() {
  playToneSequence([
    { freq: 660, type: "sine", start: 0, duration: 0.18, gain: 0.08 },
    { freq: 880, type: "sine", start: 0.1, duration: 0.24, gain: 0.08 },
  ]);
}

// CRISP TWO-BEEP CONFIRMATION WHEN AN ON-CALL ENGINEER ACKNOWLEDGES AN INCIDENT -- DISTINCT FROM
// THE GENERIC UI CLICK SO "I'M ON IT" HAS ITS OWN, RECOGNIZABLE FEEDBACK
export function playAcknowledgeBeep() {
  playToneSequence([
    { freq: 740, type: "square", start: 0, duration: 0.06, gain: 0.07 },
    { freq: 990, type: "square", start: 0.07, duration: 0.08, gain: 0.07 },
  ]);
}

// DULL, DESCENDING TONE WHEN A MITIGATION ONLY PARTIALLY FIXES THE ROOT CAUSE (fully_resolved:
// false) -- NEVER USED FOR A GENUINE FAILURE/ERROR, JUST "THAT RUNBOOK WASN'T A GREAT FIT"
export function playMitigationMismatch() {
  playToneSequence([
    { freq: 320, type: "triangle", start: 0, duration: 0.16, gain: 0.07 },
    { freq: 230, type: "triangle", start: 0.12, duration: 0.22, gain: 0.06 },
  ]);
}

// SOLEMN BOARDROOM CHIME WHEN A CAB DILEMMA IS OFFERED
export function playDilemmaChime() {
  duckMusic(1800);
  playToneSequence([
    { freq: 440, type: "sine", start: 0, duration: 0.22, gain: 0.07 },
    { freq: 330, type: "sine", start: 0.18, duration: 0.3, gain: 0.07 },
  ]);
}

// SOFT CLICK FOR OPENING A MODAL OR PANEL, QUIETER THAN THE DIRECTIVE BUTTON CLICK
export function playUiOpenSound() {
  playToneSequence([{ freq: 400, freqEnd: 620, type: "sine", start: 0, duration: 0.08, gain: 0.04 }], "ui");
  clickNoise(0.012, 4000, 0.012, "ui");
}

// TRIUMPHANT ASCENDING FANFARE FOR SURVIVING THE FULL MONTHLY AUDIT CYCLE
export function playVictoryFanfare() {
  duckMusic(2600);
  playToneSequence([
    { freq: 523.25, type: "triangle", start: 0, duration: 0.16, gain: 0.1 },
    { freq: 659.25, type: "triangle", start: 0.14, duration: 0.16, gain: 0.1 },
    { freq: 783.99, type: "triangle", start: 0.28, duration: 0.16, gain: 0.1 },
    { freq: 1046.5, type: "triangle", start: 0.42, duration: 0.4, gain: 0.12 },
    { freq: 783.99, type: "sine", start: 0.42, duration: 0.4, gain: 0.06 },
    { freq: 2093, type: "sine", start: 0.42, duration: 0.6, gain: 0.015 },
  ]);
}

// GRAVE DESCENDING STING FOR BANKRUPTCY LIQUIDATION
export function playDefeatSting() {
  duckMusic(3000);
  playToneSequence([
    { freq: 220, type: "sawtooth", start: 0, duration: 0.22, gain: 0.09, filter: { type: "lowpass", freq: 1400 } },
    { freq: 174.61, type: "sawtooth", start: 0.18, duration: 0.22, gain: 0.09, filter: { type: "lowpass", freq: 1200 } },
    { freq: 130.81, type: "sawtooth", start: 0.36, duration: 0.5, gain: 0.11, filter: { type: "lowpass", freq: 900 } },
    { freq: 65.41, type: "sine", start: 0.36, duration: 0.9, gain: 0.12 },
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
  for (let i = 0; i < 8; i++) {
    const start = i * 0.055 + Math.random() * 0.02;
    playTone({ freq: 1800 + Math.random() * 1400, type: "square", start, duration: 0.02, gain: 0.025 });
    clickNoise(0.02, 2500, 0.012, "sfx", start);
  }
}

// TWO-TONE ROTARY EMERGENCY SIREN, ONE SWEEP CYCLE -- CALL AGAIN ON A LOOP WHILE A P1 IS ACTIVE
export function playRedAlertSiren() {
  const target = getSfxOutput("siren");
  if (!target) return;
  const { ctx, out } = target;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.5);
    osc.frequency.linearRampToValueAtTime(500, now + 1.0);
    // the saw is rolled off so the alarm is urgent without being shrill
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.05, now + 0.02);
    env.gain.setValueAtTime(0.05, now + 0.95);
    env.gain.linearRampToValueAtTime(0.0001, now + 1.0);
    osc.connect(tone);
    tone.connect(env);
    env.connect(out);
    trackSource(osc, [tone, env]);
    osc.start(now);
    osc.stop(now + 1.03);
  } catch {
    // audio unsupported or blocked; the alarm stays purely visual
  }
}

// CUT THE SIREN'S ALREADY-SCHEDULED TAIL, FOR WHEN THE GAME PAUSES OR LEAVES THE PLAYING STATE
export function stopRedAlertSiren() {
  silenceLoop("siren");
}

// TENSE, SUBTLE CARDIAC-MONITOR BEEP FOR WHEN THE RUNWAY IS NEARLY EXHAUSTED
export function playCriticalHeartbeat() {
  playToneSequence(
    [
      { freq: 1000, type: "sine", start: 0, duration: 0.08, gain: 0.05 },
      { freq: 1000, type: "sine", start: 0.16, duration: 0.08, gain: 0.05 },
    ],
    "heartbeat",
  );
}

export function stopCriticalHeartbeat() {
  silenceLoop("heartbeat");
}

// --- ui sound set -----------------------------------------------------------------------------
// PUBLIC API FOR MENU/HUD/MODAL FEEDBACK. All of these ride the `ui` bus.

const HOVER_MIN_GAP_MS = 60;
const TYPE_TICK_MIN_GAP_MS = 28;

// VERY QUIET TICK WHEN THE POINTER ENTERS A MENU BUTTON (AT MOST ONE PER 60 MS)
export function playUiHoverSound() {
  if (!allowRate("ui-hover", HOVER_MIN_GAP_MS)) return;
  playToneSequence([{ freq: 1180, type: "sine", start: 0, duration: 0.03, gain: 0.012 }], "ui");
}

// CONFIRMING TWO-NOTE RISE FOR A PRIMARY ACTION (START GAME, CONFIRM CHOICE)
export function playUiConfirmSound() {
  playToneSequence(
    [
      { freq: 520, type: "triangle", start: 0, duration: 0.07, gain: 0.05 },
      { freq: 780, type: "triangle", start: 0.06, duration: 0.12, gain: 0.05 },
      { freq: 1560, type: "sine", start: 0.06, duration: 0.14, gain: 0.012 },
    ],
    "ui",
  );
}

// SOFT DESCENDING TICK FOR GOING BACK OR CLOSING
export function playUiBackSound() {
  playToneSequence(
    [
      { freq: 520, type: "sine", start: 0, duration: 0.05, gain: 0.04 },
      { freq: 390, type: "sine", start: 0.04, duration: 0.07, gain: 0.04 },
    ],
    "ui",
  );
}

// SHORT SWEPT-DOWN BLIP WHEN A PANEL CLOSES
export function playUiCloseSound() {
  playToneSequence([{ freq: 460, freqEnd: 300, type: "sine", start: 0, duration: 0.07, gain: 0.035 }], "ui");
}

// BRIGHT CHIME WHEN A RUNBOOK COOLDOWN FINISHES
export function playReadySound() {
  playToneSequence(
    [
      { freq: 990, type: "sine", start: 0, duration: 0.1, gain: 0.04 },
      { freq: 1320, type: "sine", start: 0.07, duration: 0.14, gain: 0.04 },
      { freq: 1980, type: "sine", start: 0.07, duration: 0.24, gain: 0.012 },
    ],
    "ui",
  );
}

// HEAVY THUD FOR A STAMP LANDING (DEBRIEF GRADE, "RESOLVED" STAMP): SUB-BASS DROP + BODY + PAPER SLAP
export function playStampSound() {
  playToneSequence([{ freq: 96, freqEnd: 38, type: "sine", start: 0, duration: 0.34, gain: 0.2 }]);
  playToneSequence([{ freq: 130, freqEnd: 70, type: "square", start: 0, duration: 0.1, gain: 0.05 }]);
  playNoise({ duration: 0.09, gain: 0.12, filter: { type: "lowpass", freq: 1100, freqEnd: 250 } });
  clickNoise(0.05, 2200, 0.02);
}

// GAVEL FOR A BOARD DECISION: A WOODY KNOCK WITH A SMALLER REBOUND
export function playGavelSound() {
  const knock = (at: number, level: number) => {
    playNoise({ start: at, duration: 0.05, gain: 0.14 * level, filter: { type: "bandpass", freq: 1800, q: 2.5 } });
    playToneSequence([
      { freq: 230, freqEnd: 130, type: "triangle", start: at, duration: 0.12, gain: 0.09 * level },
      { freq: 80, type: "sine", start: at, duration: 0.18, gain: 0.1 * level },
    ]);
  };
  knock(0, 1);
  knock(0.16, 0.45);
}

// SHORT TICK FOR A COUNTDOWN (LAST SECONDS OF A TIMED DECISION)
export function playCountdownTickSound() {
  playToneSequence([{ freq: 760, type: "square", start: 0, duration: 0.04, gain: 0.04 }]);
  clickNoise(0.02, 2800, 0.01);
}

// QUICK RISING SWEEP FOR A SCREEN TRANSITION
export function playWhooshSound() {
  playNoise({
    duration: 0.4,
    attack: 0.14,
    gain: 0.1,
    filter: { type: "bandpass", freq: 300, freqEnd: 3600, q: 1.1 },
    bus: "ui",
  });
  playToneSequence([{ freq: 200, freqEnd: 900, type: "sine", start: 0, duration: 0.3, gain: 0.015, attack: 0.1 }], "ui");
}

// RISING ARPEGGIO FOR TUTORIAL STEP SUCCESS / ACHIEVEMENT-LIKE MOMENTS
export function playSuccessSound() {
  playToneSequence(
    [
      { freq: 660, type: "triangle", start: 0, duration: 0.09, gain: 0.05 },
      { freq: 880, type: "triangle", start: 0.07, duration: 0.09, gain: 0.05 },
      { freq: 1175, type: "triangle", start: 0.14, duration: 0.1, gain: 0.05 },
      { freq: 1760, type: "triangle", start: 0.21, duration: 0.22, gain: 0.05 },
      { freq: 3520, type: "sine", start: 0.21, duration: 0.3, gain: 0.01 },
    ],
    "ui",
  );
}

// LOW DOUBLE BUZZ FOR A REJECTED ACTION OR A WRONG PICK
export function playErrorSound() {
  const buzz = (start: number) => ({
    freq: 150,
    type: "sawtooth" as const,
    start,
    duration: 0.1,
    gain: 0.05,
    filter: { type: "lowpass" as const, freq: 900 },
  });
  playToneSequence([buzz(0), buzz(0.13)], "ui");
}

// VERY SHORT KEYSTROKE TICK FOR TYPEWRITER TEXT, RATE-LIMITED SO FAST TYPING STAYS SOFT
export function playTypeTick() {
  if (!allowRate("type-tick", TYPE_TICK_MIN_GAP_MS)) return;
  playTone({ freq: 1700 + Math.random() * 900, type: "square", duration: 0.012, gain: 0.008, bus: "ui" });
  clickNoise(0.012, 3200, 0.01, "ui");
}
