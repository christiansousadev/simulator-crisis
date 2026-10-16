// datacenter ambience: the constant low-level bed of a machine room (air handling hiss, server fan
// drone) that tightens as the operation gets tense. It runs on the music bus, so the music volume and
// mute settings own it, and it is built only from the shared noise buffer plus two oscillators.

import { getMusicOutput, getNoiseBuffer, rampParam } from "./audioEngine";

interface Ambience {
  ctx: AudioContext;
  level: GainNode;
  hissGain: GainNode;
  hissFilter: BiquadFilterNode;
  fanGain: GainNode;
  fans: OscillatorNode[];
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

// the whole bed stays far below the effects: it should be felt, not noticed
const AMBIENCE_LEVEL = 0.5;
const HISS_BASE_GAIN = 0.018;
const HISS_TENSE_GAIN = 0.03;
const HISS_BASE_CUTOFF = 650;
const HISS_TENSE_CUTOFF = 1500;
const FAN_BASE_GAIN = 0.012;
const FAN_TENSE_GAIN = 0.022;
// two slightly detuned sawtooth drones read as a pair of fans; tension spins them up
const FAN_BASE_HZ = [54, 81];
const FAN_TENSE_HZ = [64, 96];
const FADE_IN_SECONDS = 2.5;
const FADE_OUT_MS = 800;

let ambience: Ambience | null = null;
let desiredTension = 0;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clampTension = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

function applyTension(a: Ambience) {
  const t = desiredTension;
  rampParam(a.hissGain.gain, lerp(HISS_BASE_GAIN, HISS_TENSE_GAIN, t), 0.8, a.ctx);
  rampParam(a.hissFilter.frequency, lerp(HISS_BASE_CUTOFF, HISS_TENSE_CUTOFF, t), 0.8, a.ctx);
  rampParam(a.fanGain.gain, lerp(FAN_BASE_GAIN, FAN_TENSE_GAIN, t), 0.8, a.ctx);
  a.fans.forEach((fan, i) => rampParam(fan.frequency, lerp(FAN_BASE_HZ[i], FAN_TENSE_HZ[i], t), 1.2, a.ctx));
}

// START THE BED (IDEMPOTENT); NEEDS THE AUDIO CONTEXT, SO IT WAITS FOR THE FIRST USER GESTURE
export function startDatacenterAmbience() {
  if (ambience) return;
  try {
    const output = getMusicOutput();
    const noise = getNoiseBuffer();
    if (!output || !noise) return;
    const { ctx, out } = output;

    const level = ctx.createGain();
    level.gain.setValueAtTime(0.0001, ctx.currentTime);
    level.gain.linearRampToValueAtTime(AMBIENCE_LEVEL, ctx.currentTime + FADE_IN_SECONDS);
    level.connect(out);

    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "lowpass";
    hissFilter.frequency.value = HISS_BASE_CUTOFF;
    const hissGain = ctx.createGain();
    hissGain.gain.value = HISS_BASE_GAIN;
    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(level);

    const fanFilter = ctx.createBiquadFilter();
    fanFilter.type = "lowpass";
    fanFilter.frequency.value = 240;
    const fanGain = ctx.createGain();
    fanGain.gain.value = FAN_BASE_GAIN;
    fanFilter.connect(fanGain);
    fanGain.connect(level);
    const fans = FAN_BASE_HZ.map((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = hz;
      osc.detune.value = i === 0 ? -6 : 7;
      osc.connect(fanFilter);
      return osc;
    });

    const sources: AudioScheduledSourceNode[] = [hiss, ...fans];
    const a: Ambience = {
      ctx,
      level,
      hissGain,
      hissFilter,
      fanGain,
      fans,
      sources,
      nodes: [level, hissFilter, hissGain, fanFilter, fanGain],
    };
    sources.forEach((s) => s.start());
    ambience = a;
    applyTension(a);
  } catch {
    ambience = null;
    // audio unsupported or blocked; the bed is decoration only
  }
}

// TIGHTEN THE BED WITH THE OPERATION'S TENSION (0 = calm machine room, 1 = everything screaming)
export function setAmbienceTension(tension: number) {
  desiredTension = clampTension(tension);
  if (ambience) applyTension(ambience);
}

// FADE THE BED OUT AND TEAR DOWN EVERY NODE
export function stopDatacenterAmbience() {
  const a = ambience;
  if (!a) return;
  ambience = null;
  try {
    rampParam(a.level.gain, 0, 0.15, a.ctx);
  } catch {
    // context already closed
  }
  setTimeout(() => {
    for (const src of a.sources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    for (const node of [...a.sources, ...a.nodes]) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
  }, FADE_OUT_MS);
}

export function isAmbiencePlaying(): boolean {
  return ambience !== null;
}
