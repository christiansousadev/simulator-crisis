// layered procedural music on the shared audio graph. three layers cross-fade by mode:
//   menu    calm chord-progression pad with sparse bell plucks (scheduled bar by bar)
//   game    low drone bed (sub + detuned triads + air), retuned by MusicTension
//   tension pulse / dissonance / rumble layers scaled by tension and DEFCON
// every change is a parameter ramp (setTargetAtTime), so nothing ever clicks.

import { getMusicOutput, getNoiseBuffer, rampParam, trackSource, unlockAudio } from "./audioEngine";

export type MusicTension = "calm" | "tense" | "critical";
export type MusicMode = "menu" | "game" | "paused";
export type DefconInput = 1 | 2 | 3 | 4 | 5;

export const MODE_CROSSFADE_SECONDS = 1.5;
// setTargetAtTime reaches ~95% after three time constants
const CROSSFADE_TC = MODE_CROSSFADE_SECONDS / 3;
const TENSION_TC = 0.8;
const FADE_IN_TC = 0.7;
const DUCK_LEVEL = 0.5; // -6 dB
const DUCK_ATTACK_TC = 0.05;
const DUCK_RELEASE_TC = 0.4;
const OPEN_CUTOFF_HZ = 18000;
const MUFFLED_CUTOFF_HZ = 700;
const SILENT = 0.0001;
const BAR_SECONDS = 8;

// three hand-picked triads, each darker than the last, for the game bed
const BED_CHORDS: Record<MusicTension, number[]> = {
  calm: [130.81, 164.81, 196.0],
  tense: [130.81, 155.56, 196.0],
  critical: [123.47, 146.83, 174.61],
};

const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

// a minor, slow and warm: Am9 - Fmaj7 - C(add9) - Em7
const MENU_BARS: { bass: number; notes: number[] }[] = [
  { bass: 45, notes: [57, 60, 64, 71] },
  { bass: 41, notes: [53, 57, 60, 64] },
  { bass: 48, notes: [60, 64, 67, 74] },
  { bass: 40, notes: [55, 59, 62, 64] },
];
const MENU_PLUCK_SCALE = [69, 72, 74, 76, 79, 81];

interface ModeTargets {
  menu: number;
  game: number;
  tension: number;
  level: number;
  cutoff: number;
}

export const MODE_TARGETS: Record<MusicMode, ModeTargets> = {
  menu: { menu: 1, game: 0, tension: 0, level: 1, cutoff: OPEN_CUTOFF_HZ },
  game: { menu: 0, game: 1, tension: 1, level: 1, cutoff: OPEN_CUTOFF_HZ },
  // game bed low-passed and ducked while the simulation is stopped
  paused: { menu: 0, game: 1, tension: 0.5, level: 0.5, cutoff: MUFFLED_CUTOFF_HZ },
};

const TENSION_VALUE: Record<MusicTension, number> = { calm: 0, tense: 0.5, critical: 1 };
const DEFCON_VALUE: Record<DefconInput, number> = { 5: 0, 4: 0.15, 3: 0.45, 2: 0.75, 1: 1 };

// 0 (relaxed) .. 1 (collapse imminent): the louder of the incident-driven and DEFCON-driven reads
export function computeMusicIntensity(tension: MusicTension, defcon: DefconInput): number {
  return Math.max(TENSION_VALUE[tension], DEFCON_VALUE[defcon]);
}

interface TensionParts {
  pulseAmp: GainNode;
  pulseDepth: GainNode;
  pulseLfo: OscillatorNode;
  dissGain: GainNode;
  rumbleGain: GainNode;
  rumbleFilter: BiquadFilterNode;
}

interface MusicGraph {
  ctx: AudioContext;
  menu: GainNode;
  game: GainNode;
  tension: GainNode;
  level: GainNode;
  duck: GainNode;
  muffle: BiquadFilterNode;
  menuIn: BiquadFilterNode;
  pluckSend: GainNode;
  bedOscs: { osc: OscillatorNode; index: number }[];
  parts: TensionParts;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  timer: ReturnType<typeof setInterval> | null;
  nextBarTime: number;
  barIndex: number;
  menuAudibleUntil: number;
}

// what the engine is asked for, kept even before the graph exists so a late start picks it up
const desired: { mode: MusicMode; tension: MusicTension; defcon: DefconInput } = {
  mode: "menu",
  tension: "calm",
  defcon: 5,
};
// last targets handed to the graph, mirrored for getMusicDebug
const applied = { menu: 0, game: 0, tension: 0, level: 0, cutoff: OPEN_CUTOFF_HZ, duck: 1, intensity: 0 };

let music: MusicGraph | null = null;
let duckUntilMs = 0;

// --- graph construction -----------------------------------------------------------------------

function noiseSource(ctx: AudioContext, g: MusicGraph): AudioBufferSourceNode | null {
  const buffer = getNoiseBuffer();
  if (!buffer) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  g.sources.push(src);
  trackSource(src, [], false);
  src.start();
  return src;
}

function osc(ctx: AudioContext, g: MusicGraph, type: OscillatorType, freq: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.sources.push(o);
  trackSource(o, [], false);
  o.start();
  return o;
}

// a tracked gain node; `to` may be a node (audio path) or a param (lfo modulation), omitted = unrouted
function gain(ctx: AudioContext, g: MusicGraph, value: number, to?: AudioNode | AudioParam): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  // connect() accepts both targets at runtime; the DOM typings only split them into overloads
  if (to) node.connect(to as AudioNode);
  g.nodes.push(node);
  return node;
}

function buildMusicGraph(ctx: AudioContext, out: GainNode): MusicGraph {
  const make = <T extends AudioNode>(n: T): T => {
    nodes.push(n);
    return n;
  };
  const nodes: AudioNode[] = [];
  const level = make(ctx.createGain());
  const duck = make(ctx.createGain());
  const muffle = make(ctx.createBiquadFilter());
  level.gain.value = 0;
  duck.gain.value = 1;
  muffle.type = "lowpass";
  muffle.frequency.value = OPEN_CUTOFF_HZ;
  muffle.Q.value = 0.5;
  level.connect(duck);
  duck.connect(muffle);
  muffle.connect(out);

  const layer = () => {
    const n = make(ctx.createGain());
    n.gain.value = 0;
    n.connect(level);
    return n;
  };
  const menu = layer();
  const game = layer();
  const tension = layer();

  const menuIn = make(ctx.createBiquadFilter());
  menuIn.type = "lowpass";
  menuIn.frequency.value = 1500;
  menuIn.connect(menu);

  // pluck echo: delay with a darkening feedback loop
  const pluckSend = make(ctx.createGain());
  const delay = make(ctx.createDelay(1.5));
  delay.delayTime.value = 0.45;
  const feedback = make(ctx.createGain());
  feedback.gain.value = 0.38;
  const echoTone = make(ctx.createBiquadFilter());
  echoTone.type = "lowpass";
  echoTone.frequency.value = 2200;
  pluckSend.connect(delay);
  delay.connect(echoTone);
  echoTone.connect(feedback);
  feedback.connect(delay);
  echoTone.connect(menuIn);

  const g: MusicGraph = {
    ctx,
    menu,
    game,
    tension,
    level,
    duck,
    muffle,
    menuIn,
    pluckSend,
    bedOscs: [] as { osc: OscillatorNode; index: number }[],
    parts: null as unknown as TensionParts,
    sources: [] as AudioScheduledSourceNode[],
    nodes,
    timer: null as ReturnType<typeof setInterval> | null,
    nextBarTime: ctx.currentTime + 0.1,
    barIndex: 0,
    menuAudibleUntil: 0,
  };

  buildGameBed(ctx, g);
  g.parts = buildTensionLayers(ctx, g);
  return g;
}

// drone bed: sub + two detuned triangles per chord tone, slowly breathing and filter-swept
function buildGameBed(ctx: AudioContext, g: MusicGraph) {
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 900;
  bedFilter.Q.value = 0.6;
  bedFilter.connect(g.game);
  g.nodes.push(bedFilter);

  const sub = osc(ctx, g, "sine", 65.41);
  sub.connect(gain(ctx, g, 0.22, g.game));

  // slow lfos: one makes the voices breathe, one sweeps the bed's brightness
  const breathDepth = gain(ctx, g, 0.025);
  osc(ctx, g, "sine", 0.08).connect(breathDepth);
  const sweepDepth = gain(ctx, g, 220, bedFilter.frequency);
  osc(ctx, g, "sine", 0.05).connect(sweepDepth);

  BED_CHORDS.calm.forEach((freq, index) => {
    for (const detune of [-7, 7]) {
      const o = osc(ctx, g, "triangle", freq, detune);
      const voice = gain(ctx, g, 0.085, bedFilter);
      breathDepth.connect(voice.gain);
      o.connect(voice);
      g.bedOscs.push({ osc: o, index });
    }
  });

  const air = noiseSource(ctx, g);
  if (air) {
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "lowpass";
    airFilter.frequency.value = 450;
    g.nodes.push(airFilter);
    air.connect(airFilter);
    airFilter.connect(gain(ctx, g, 0.035, g.game));
  }
}

function buildTensionLayers(ctx: AudioContext, g: MusicGraph): TensionParts {
  // heartbeat-like pulse: a sub tone whose amplitude is swung by a slow lfo
  const pulseTone = osc(ctx, g, "sine", 49);
  const pulseAmp = gain(ctx, g, 0, g.tension);
  pulseTone.connect(pulseAmp);
  const pulseLfo = osc(ctx, g, "sine", 0.8);
  const pulseDepth = gain(ctx, g, 0, pulseAmp.gain);
  pulseLfo.connect(pulseDepth);

  // a rubbing minor second high above the bed
  const dissGain = gain(ctx, g, 0, g.tension);
  osc(ctx, g, "sine", 233.08).connect(dissGain);
  osc(ctx, g, "sine", 246.94).connect(dissGain);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "bandpass";
  rumbleFilter.frequency.value = 140;
  rumbleFilter.Q.value = 1;
  g.nodes.push(rumbleFilter);
  const rumbleGain = gain(ctx, g, 0, g.tension);
  const rumble = noiseSource(ctx, g);
  if (rumble) {
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
  }
  return { pulseAmp, pulseDepth, pulseLfo, dissGain, rumbleGain, rumbleFilter };
}

// --- applying the desired state ---------------------------------------------------------------

function applyMode(g: MusicGraph, initial: boolean) {
  const t = MODE_TARGETS[desired.mode];
  const { ctx } = g;
  if (initial) {
    g.menu.gain.value = t.menu;
    g.game.gain.value = t.game;
    g.tension.gain.value = t.tension;
    g.muffle.frequency.value = t.cutoff;
    rampParam(g.level.gain, t.level, FADE_IN_TC, ctx);
  } else {
    rampParam(g.menu.gain, t.menu, CROSSFADE_TC, ctx);
    rampParam(g.game.gain, t.game, CROSSFADE_TC, ctx);
    rampParam(g.tension.gain, t.tension, CROSSFADE_TC, ctx);
    rampParam(g.level.gain, t.level, CROSSFADE_TC, ctx);
    rampParam(g.muffle.frequency, t.cutoff, CROSSFADE_TC, ctx);
  }
  Object.assign(applied, { menu: t.menu, game: t.game, tension: t.tension, level: t.level, cutoff: t.cutoff });
  if (desired.mode === "menu") g.menuAudibleUntil = Number.POSITIVE_INFINITY;
  else if (g.menuAudibleUntil === Number.POSITIVE_INFINITY) g.menuAudibleUntil = ctx.currentTime + MODE_CROSSFADE_SECONDS + 6;
}

function applyTension(g: MusicGraph) {
  const { ctx, parts } = g;
  const intensity = computeMusicIntensity(desired.tension, desired.defcon);
  applied.intensity = intensity;
  const dissonance = Math.max(0, (intensity - 0.45) / 0.55);
  const pulse = intensity < 0.05 ? 0 : 0.2 * intensity;
  rampParam(parts.pulseAmp.gain, pulse, TENSION_TC, ctx);
  rampParam(parts.pulseDepth.gain, pulse, TENSION_TC, ctx);
  rampParam(parts.pulseLfo.frequency, 0.8 + 1.6 * intensity, TENSION_TC, ctx);
  rampParam(parts.dissGain.gain, 0.045 * dissonance, TENSION_TC, ctx);
  rampParam(parts.rumbleGain.gain, 0.09 * intensity, TENSION_TC, ctx);
  rampParam(parts.rumbleFilter.frequency, 130 + 300 * intensity, TENSION_TC, ctx);

  const chord = BED_CHORDS[desired.tension];
  for (const { osc: o, index } of g.bedOscs) {
    rampParam(o.frequency, chord[index], TENSION_TC * 0.75, ctx);
  }
}

// --- menu theme scheduler ---------------------------------------------------------------------

function scheduleVoice(
  g: MusicGraph,
  type: OscillatorType,
  hz: number,
  t0: number,
  duration: number,
  peak: number,
  attack: number,
  dest: AudioNode,
  decays: boolean,
  detune = 0,
) {
  const { ctx } = g;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  o.detune.value = detune;
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + attack);
  // pads sustain then release; plucks decay straight away
  if (!decays) env.gain.setValueAtTime(peak, t0 + duration - 3.5);
  env.gain.exponentialRampToValueAtTime(SILENT, t0 + duration);
  o.connect(env);
  env.connect(dest);
  trackSource(o, [env]);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

function scheduleMenuBar(g: MusicGraph, t0: number) {
  const bar = MENU_BARS[g.barIndex % MENU_BARS.length];
  g.barIndex += 1;
  scheduleVoice(g, "sine", midiToHz(bar.bass), t0, BAR_SECONDS + 1, 0.14, 1.5, g.menuIn, false);
  for (const note of bar.notes) {
    for (const detune of [-5, 5]) {
      scheduleVoice(g, "triangle", midiToHz(note), t0, BAR_SECONDS + 1, 0.05, 2.5, g.menuIn, false, detune);
    }
  }
  // three bell plucks per bar at loose offsets, each with a quiet octave partial
  for (const offset of [1.6, 3.7, 5.8]) {
    const note = MENU_PLUCK_SCALE[Math.floor(Math.random() * MENU_PLUCK_SCALE.length)];
    const at = t0 + offset + Math.random() * 0.4;
    scheduleVoice(g, "sine", midiToHz(note), at, 2.6, 0.06, 0.01, g.pluckSend, true);
    scheduleVoice(g, "sine", midiToHz(note) * 2, at, 1.6, 0.02, 0.01, g.pluckSend, true);
  }
}

function tickMenuScheduler(g: MusicGraph) {
  const now = g.ctx.currentTime;
  // nothing is scheduled while the menu theme is faded out; resume on the next bar boundary
  if (now > g.menuAudibleUntil) {
    g.nextBarTime = now + 0.1;
    return;
  }
  while (g.nextBarTime < now + 1.0) {
    scheduleMenuBar(g, g.nextBarTime);
    g.nextBarTime += BAR_SECONDS;
  }
}

// --- public api -------------------------------------------------------------------------------

// START THE LAYERED MUSIC ENGINE; BROWSERS REQUIRE THIS TO FOLLOW A USER GESTURE
export function startAmbientMusic() {
  if (music) return;
  try {
    unlockAudio();
    const output = getMusicOutput();
    if (!output) return;
    const g = buildMusicGraph(output.ctx, output.out);
    music = g;
    applyMode(g, true);
    applyTension(g);
    tickMenuScheduler(g);
    g.timer = setInterval(() => tickMenuScheduler(g), 400);
  } catch {
    music = null;
    // audio unsupported or blocked by browser policy; the game remains fully playable without it
  }
}

// FADE OUT AND TEAR DOWN THE MUSIC ENGINE, STOPPING EVERY SOURCE AND DISCONNECTING EVERY NODE
export function stopAmbientMusic() {
  const g = music;
  if (!g) return;
  music = null;
  if (g.timer) clearInterval(g.timer);
  try {
    rampParam(g.level.gain, 0, 0.1, g.ctx);
  } catch {
    // context already closed
  }
  setTimeout(() => {
    for (const src of g.sources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    for (const node of g.nodes) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
  }, 600);
}

// RETUNE THE GAME BED AND SCALE THE TENSION LAYERS TO THE CURRENT INCIDENT LOAD
export function setMusicTension(tension: MusicTension) {
  if (desired.tension === tension) return;
  desired.tension = tension;
  if (music) applyTension(music);
}

// SCALE THE TENSION LAYERS BY THE CURRENT DEFCON LEVEL (1 = WORST)
export function setMusicDefcon(level: DefconInput) {
  if (desired.defcon === level) return;
  desired.defcon = level;
  if (music) applyTension(music);
}

// CROSS-FADE BETWEEN THE MENU THEME, THE FULL GAME BED AND THE MUFFLED, DUCKED PAUSE BED
export function setMusicMode(mode: MusicMode) {
  if (desired.mode === mode) return;
  desired.mode = mode;
  if (music) applyMode(music, false);
}

// DUCK THE MUSIC BY 6 DB FOR `ms`, THEN SWELL BACK (OVERLAPPING CALLS EXTEND THE DUCK)
export function duckMusic(ms: number) {
  const g = music;
  if (!g) return;
  const nowMs = Date.now();
  duckUntilMs = Math.max(duckUntilMs, nowMs + ms);
  const remaining = (duckUntilMs - nowMs) / 1000;
  rampParam(g.duck.gain, DUCK_LEVEL, DUCK_ATTACK_TC, g.ctx);
  g.duck.gain.setTargetAtTime(1, g.ctx.currentTime + remaining, DUCK_RELEASE_TC);
  applied.duck = DUCK_LEVEL;
  setTimeout(() => {
    if (Date.now() >= duckUntilMs) applied.duck = 1;
  }, remaining * 1000 + 50);
}

// WHETHER THE MUSIC ENGINE IS CURRENTLY RUNNING
export function isMusicPlaying(): boolean {
  return music !== null;
}

export interface MusicDebug {
  playing: boolean;
  mode: MusicMode;
  tension: MusicTension;
  defcon: DefconInput;
  intensity: number;
  layers: { menu: number; game: number; tension: number; level: number; cutoffHz: number; duck: number };
}

export function getMusicDebug(): MusicDebug {
  return {
    playing: music !== null,
    mode: desired.mode,
    tension: desired.tension,
    defcon: desired.defcon,
    intensity: computeMusicIntensity(desired.tension, desired.defcon),
    layers: {
      menu: applied.menu,
      game: applied.game,
      tension: applied.tension,
      level: applied.level,
      cutoffHz: applied.cutoff,
      duck: applied.duck,
    },
  };
}
