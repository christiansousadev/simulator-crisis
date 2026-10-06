// shared web audio graph: ONE lazily created AudioContext, a bus layout and the synth primitives
// (enveloped oscillators and filtered noise bursts) every sound effect is built from.
//
//   sfx / ui / music buses -> master gain (mute) -> soft limiter -> destination
//
// No audio files, no dependencies; everything degrades silently when web audio is unavailable
// (jsdom, locked-down browsers, autoplay policy before the first gesture).

type OscType = OscillatorNode["type"];

export type SfxBus = "sfx" | "ui" | "siren" | "heartbeat";

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  // when set the cutoff sweeps (exponentially) from `freq` to `freqEnd` over the sound
  freqEnd?: number;
  q?: number;
}

export interface ToneOptions {
  freq: number;
  type?: OscType;
  start?: number;
  duration: number;
  gain?: number;
  // seconds to reach the peak; a few ms by default so the onset never clicks
  attack?: number;
  // seconds the peak is held before the exponential decay
  hold?: number;
  freqEnd?: number;
  detune?: number;
  filter?: FilterSpec;
  bus?: SfxBus;
}

export interface NoiseOptions {
  start?: number;
  duration: number;
  gain?: number;
  attack?: number;
  filter?: FilterSpec;
  bus?: SfxBus;
}

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  sfx: GainNode;
  ui: GainNode;
  music: GainNode;
  loops: Record<"siren" | "heartbeat", GainNode>;
  noise: AudioBuffer | null;
}

const VOLUME_STORAGE_KEY = "incidentzero.audio_volume";
const MUTED_STORAGE_KEY = "incidentzero.audio_muted";
const MUSIC_VOLUME_STORAGE_KEY = "incidentzero.music_volume";
const MUSIC_MUTED_STORAGE_KEY = "incidentzero.music_muted";

// the pads sit well below the effects, so the music slider maps onto a quieter bus
const MUSIC_BUS_SCALE = 0.5;
const BUS_RAMP_SECONDS = 0.03;
// one-shots past this many concurrent voices are dropped instead of piling up
const MAX_ONE_SHOT_VOICES = 48;
const SILENT = 0.0001;

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? fallback : Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
  } catch {
    return fallback;
  }
}

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort only
  }
}

const hasWindow = typeof window !== "undefined";
let sfxVolume = hasWindow ? loadNumber(VOLUME_STORAGE_KEY, 1) : 1;
let masterMuted = hasWindow ? loadFlag(MUTED_STORAGE_KEY) : false;
let musicVolume = hasWindow ? loadNumber(MUSIC_VOLUME_STORAGE_KEY, 0.5) : 0.5;
let musicMuted = hasWindow ? loadFlag(MUSIC_MUTED_STORAGE_KEY) : false;

let graph: AudioGraph | null = null;
let gestureSeen = false;
let unsupported = false;
let contextsCreated = 0;
let activeSources = 0;
let oneShotVoices = 0;
const loopSilenced: Record<"siren" | "heartbeat", boolean> = { siren: false, heartbeat: false };
const lastPlayedAt = new Map<string, number>();

// --- settings ---------------------------------------------------------------------------------

// READ THE CURRENT SFX VOLUME (0-1) AND THE MASTER MUTE STATE
export function getAudioSettings(): { volume: number; muted: boolean } {
  return { volume: sfxVolume, muted: masterMuted };
}

// SET MASTER SFX VOLUME (0-1), PERSISTED ACROSS SESSIONS
export function setMasterVolume(volume: number) {
  sfxVolume = Math.max(0, Math.min(1, volume));
  persist(VOLUME_STORAGE_KEY, String(sfxVolume));
  applyBusGains();
}

// TOGGLE MASTER MUTE (SILENCES EFFECTS, MUSIC AND LOOPING ALARMS), PERSISTED ACROSS SESSIONS
export function setMuted(next: boolean) {
  masterMuted = next;
  persist(MUTED_STORAGE_KEY, String(masterMuted));
  applyBusGains();
}

export function isAudioMuted(): boolean {
  return masterMuted;
}

export function setAudioMuted(next: boolean) {
  setMuted(next);
}

// READ THE CURRENT MUSIC VOLUME (0-1) AND MUSIC-ONLY MUTE STATE
export function getMusicSettings(): { volume: number; muted: boolean } {
  return { volume: musicVolume, muted: musicMuted };
}

// SET AMBIENT MUSIC VOLUME (0-1), PERSISTED ACROSS SESSIONS, APPLIED LIVE IF PLAYING
export function setMusicVolume(volume: number) {
  musicVolume = Math.max(0, Math.min(1, volume));
  persist(MUSIC_VOLUME_STORAGE_KEY, String(musicVolume));
  applyBusGains();
}

// TOGGLE MUSIC-ONLY MUTE, PERSISTED ACROSS SESSIONS, APPLIED LIVE IF PLAYING
export function setMusicMuted(next: boolean) {
  musicMuted = next;
  persist(MUSIC_MUTED_STORAGE_KEY, String(musicMuted));
  applyBusGains();
}

// WHAT EACH BUS SHOULD CURRENTLY BE AT, DERIVED PURELY FROM THE SETTINGS
function computeBusTargets() {
  return {
    master: masterMuted ? 0 : 1,
    sfx: sfxVolume,
    ui: sfxVolume,
    music: musicMuted ? 0 : musicVolume * MUSIC_BUS_SCALE,
  };
}

// --- param helpers ----------------------------------------------------------------------------

// SMOOTHLY MOVE A PARAM TO A TARGET FROM WHEREVER IT CURRENTLY IS (NO CLICKS, SAFE TO CALL OFTEN)
export function rampParam(param: AudioParam, target: number, timeConstant: number, ctx: AudioContext) {
  const t = ctx.currentTime;
  try {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  } catch {
    // very old engines; the target ramp below still works
  }
  param.setTargetAtTime(target, t, Math.max(0.001, timeConstant));
}

function applyBusGains() {
  if (!graph) return;
  const targets = computeBusTargets();
  const { ctx } = graph;
  rampParam(graph.master.gain, targets.master, BUS_RAMP_SECONDS, ctx);
  rampParam(graph.sfx.gain, targets.sfx, BUS_RAMP_SECONDS, ctx);
  rampParam(graph.ui.gain, targets.ui, BUS_RAMP_SECONDS, ctx);
  rampParam(graph.music.gain, targets.music, BUS_RAMP_SECONDS, ctx);
}

// --- context lifecycle ------------------------------------------------------------------------

type ContextCtor = typeof AudioContext;

// Safari (desktop and iOS) still only exposes the constructor under its vendor-prefixed name
function resolveContextCtor(): ContextCtor | null {
  const g = globalThis as typeof globalThis & { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  try {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  } catch {
    return null;
  }
}

function buildGraph(Ctor: ContextCtor): AudioGraph {
  const ctx = new Ctor();
  contextsCreated += 1;
  const targets = computeBusTargets();

  const master = ctx.createGain();
  master.gain.value = targets.master;
  // soft limiter so a stack of simultaneous stingers never clips
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.22;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const sfx = ctx.createGain();
  sfx.gain.value = targets.sfx;
  const ui = ctx.createGain();
  ui.gain.value = targets.ui;
  const music = ctx.createGain();
  music.gain.value = targets.music;
  sfx.connect(master);
  ui.connect(master);
  music.connect(master);

  // the looping alarms get their own sub-buses so they can be cut instantly when the game stops
  const siren = ctx.createGain();
  const heartbeat = ctx.createGain();
  siren.connect(sfx);
  heartbeat.connect(sfx);

  return { ctx, master, limiter, sfx, ui, music, loops: { siren, heartbeat }, noise: createNoiseBuffer(ctx) };
}

function resumeContext(ctx: AudioContext) {
  if (ctx.state !== "suspended") return;
  try {
    void Promise.resolve(ctx.resume()).catch(() => {});
  } catch {
    // resume is best-effort; the next gesture retries
  }
}

function ensureGraph(): AudioGraph | null {
  if (graph) {
    resumeContext(graph.ctx);
    return graph;
  }
  // creating the context before any gesture only earns a console warning and a dead context
  if (!gestureSeen || unsupported) return null;
  const Ctor = resolveContextCtor();
  if (!Ctor) {
    unsupported = true;
    return null;
  }
  try {
    graph = buildGraph(Ctor);
    resumeContext(graph.ctx);
  } catch {
    graph = null;
  }
  return graph;
}

// MARK THE AUTOPLAY GESTURE AS SEEN, CREATE THE SHARED CONTEXT IF NEEDED AND RESUME IT
export function unlockAudio(): AudioContext | null {
  gestureSeen = true;
  return ensureGraph()?.ctx ?? null;
}

function installGestureUnlock() {
  if (!hasWindow) return;
  const unlock = () => {
    unlockAudio();
  };
  for (const evt of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(evt, unlock, { capture: true, passive: true });
  }
}
installGestureUnlock();

// --- access for the music engine --------------------------------------------------------------

export function getMusicOutput(): { ctx: AudioContext; out: GainNode } | null {
  const g = ensureGraph();
  return g ? { ctx: g.ctx, out: g.music } : null;
}

export function getNoiseBuffer(): AudioBuffer | null {
  return graph?.noise ?? null;
}

// TRACK A SOURCE SO ITS NODES ARE DISCONNECTED THE MOMENT IT ENDS (NO LEAKED NODES)
export function trackSource(source: AudioScheduledSourceNode, extra: AudioNode[] = [], oneShot = true) {
  activeSources += 1;
  if (oneShot) oneShotVoices += 1;
  source.onended = () => {
    activeSources = Math.max(0, activeSources - 1);
    if (oneShot) oneShotVoices = Math.max(0, oneShotVoices - 1);
    try {
      source.disconnect();
    } catch {
      // already disconnected
    }
    for (const node of extra) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
  };
}

// --- one-shot primitives ----------------------------------------------------------------------

function sfxGraph(): AudioGraph | null {
  if (masterMuted || sfxVolume <= 0) return null;
  const g = ensureGraph();
  if (!g || g.ctx.state === "closed" || oneShotVoices >= MAX_ONE_SHOT_VOICES) return null;
  return g;
}

function resolveBus(g: AudioGraph, bus: SfxBus): GainNode {
  if (bus === "siren" || bus === "heartbeat") {
    if (loopSilenced[bus]) {
      loopSilenced[bus] = false;
      rampParam(g.loops[bus].gain, 1, 0.01, g.ctx);
    }
    return g.loops[bus];
  }
  return bus === "ui" ? g.ui : g.sfx;
}

function makeFilter(ctx: AudioContext, spec: FilterSpec, t0: number, t1: number): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type;
  filter.frequency.setValueAtTime(spec.freq, t0);
  if (spec.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), t1);
  if (spec.q !== undefined) filter.Q.value = spec.q;
  return filter;
}

function applyEnvelope(param: AudioParam, t0: number, t1: number, peak: number, attack: number, hold: number) {
  param.setValueAtTime(SILENT, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  if (hold > 0) param.setValueAtTime(peak, t0 + attack + hold);
  param.exponentialRampToValueAtTime(SILENT, Math.max(t1, t0 + attack + hold + 0.005));
}

// ONE ENVELOPED OSCILLATOR NOTE, OPTIONALLY SWEPT AND FILTERED
export function playTone(o: ToneOptions) {
  const g = sfxGraph();
  if (!g) return;
  try {
    const { ctx } = g;
    const t0 = ctx.currentTime + (o.start ?? 0);
    const t1 = t0 + o.duration;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t1);
    if (o.detune) osc.detune.value = o.detune;

    const env = ctx.createGain();
    applyEnvelope(env.gain, t0, t1, o.gain ?? 0.08, o.attack ?? 0.004, o.hold ?? 0);

    const owned: AudioNode[] = [env];
    let tail: AudioNode = osc;
    if (o.filter) {
      const filter = makeFilter(ctx, o.filter, t0, t1);
      tail.connect(filter);
      tail = filter;
      owned.push(filter);
    }
    tail.connect(env);
    env.connect(resolveBus(g, o.bus ?? "sfx"));
    trackSource(osc, owned);
    osc.start(t0);
    osc.stop(t1 + 0.03);
  } catch {
    // audio unsupported or blocked; effects are decoration only
  }
}

// ONE FILTERED NOISE BURST (CLICKS, THUDS, WHOOSHES)
export function playNoise(o: NoiseOptions) {
  const g = sfxGraph();
  if (!g || !g.noise) return;
  try {
    const { ctx } = g;
    const t0 = ctx.currentTime + (o.start ?? 0);
    const t1 = t0 + o.duration;
    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;

    const env = ctx.createGain();
    applyEnvelope(env.gain, t0, t1, o.gain ?? 0.05, o.attack ?? 0.002, 0);

    const owned: AudioNode[] = [env];
    let tail: AudioNode = src;
    if (o.filter) {
      const filter = makeFilter(ctx, o.filter, t0, t1);
      tail.connect(filter);
      tail = filter;
      owned.push(filter);
    }
    tail.connect(env);
    env.connect(resolveBus(g, o.bus ?? "sfx"));
    trackSource(src, owned);
    const offset = Math.random() * Math.max(0, g.noise.duration - o.duration - 0.1);
    src.start(t0, offset);
    src.stop(t1 + 0.03);
  } catch {
    // audio unsupported or blocked; effects are decoration only
  }
}

// RAW SCHEDULING HOOK FOR SOUNDS THAT NEED A CUSTOM GRAPH (THE SIREN'S TWO-STAGE SWEEP)
export function getSfxOutput(bus: SfxBus): { ctx: AudioContext; out: GainNode } | null {
  const g = sfxGraph();
  return g ? { ctx: g.ctx, out: resolveBus(g, bus) } : null;
}

// CUT A LOOPING ALARM'S ALREADY-SCHEDULED TAIL RIGHT AWAY (PAUSE, MENUS, GAME OVER)
export function silenceLoop(bus: "siren" | "heartbeat") {
  if (!graph || loopSilenced[bus]) return;
  loopSilenced[bus] = true;
  rampParam(graph.loops[bus].gain, 0, 0.03, graph.ctx);
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// TRUE (AND RECORDS THE HIT) WHEN `key` HAS NOT FIRED WITHIN THE LAST `minGapMs`
export function allowRate(key: string, minGapMs: number): boolean {
  const now = nowMs();
  const last = lastPlayedAt.get(key);
  if (last !== undefined && now - last < minGapMs) return false;
  lastPlayedAt.set(key, now);
  return true;
}

// --- debug ------------------------------------------------------------------------------------

export interface AudioEngineDebug {
  contextCreated: boolean;
  contextState: string;
  contextsCreated: number;
  muted: boolean;
  musicMuted: boolean;
  busGains: { master: number; sfx: number; ui: number; music: number };
  activeNodes: number;
}

export function getEngineDebug(): AudioEngineDebug {
  return {
    contextCreated: graph !== null,
    contextState: graph?.ctx.state ?? "none",
    contextsCreated,
    muted: masterMuted,
    musicMuted,
    busGains: computeBusTargets(),
    activeNodes: activeSources,
  };
}
