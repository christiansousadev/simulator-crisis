import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endAllSources, FakeAudioContext, FakeParam, installFakeAudio, uninstallFakeAudio } from "../test/fakeAudio";

type SoundModule = typeof import("./sound");

// the engine keeps module-level state (one context, settings), so every test gets a fresh copy
async function loadSound(): Promise<SoundModule> {
  vi.resetModules();
  return import("./sound");
}

function allParams(ctx: FakeAudioContext): FakeParam[] {
  const params: FakeParam[] = [];
  for (const node of ctx.nodes) {
    for (const value of Object.values(node)) if (value instanceof FakeParam) params.push(value);
  }
  return params;
}

function targetCalls(ctx: FakeAudioContext) {
  return allParams(ctx).flatMap((p) => p.calls.filter((c) => c.type === "target"));
}

// gain nodes are created in a fixed order by the graph: master, sfx, ui, music, siren, heartbeat
const MASTER = 0;
const MUSIC = 3;

describe("audio engine", () => {
  beforeEach(() => {
    localStorage.clear();
    installFakeAudio();
  });

  afterEach(() => {
    uninstallFakeAudio();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("never throws when AudioContext is undefined", async () => {
    uninstallFakeAudio();
    const sound = await loadSound();
    const fns = Object.entries(sound).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => unknown][];
    expect(fns.length).toBeGreaterThan(30);
    sound.unlockAudio();
    for (const [name, fn] of fns) {
      if (name === "getAudioDebug") continue;
      expect(() => (name === "playIncidentChirp" ? fn(true) : fn.length === 0 ? fn() : fn(0.5))).not.toThrow();
    }
    expect(sound.getAudioDebug().contextCreated).toBe(false);
    expect(sound.isMusicPlaying()).toBe(false);
  });

  it("creates no context before a user gesture, then exactly one on it", async () => {
    const sound = await loadSound();
    sound.playClickSound();
    expect(FakeAudioContext.instances).toHaveLength(0);
    window.dispatchEvent(new Event("pointerdown"));
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].state).toBe("running");
  });

  it("reuses a single context for every effect and the music, and never closes it", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.playClickSound();
    sound.playCashSound();
    sound.playVictoryFanfare();
    sound.playKeyboardClatter();
    sound.playRedAlertSiren();
    sound.playStampSound();
    sound.startAmbientMusic();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(sound.getAudioDebug().contextsCreated).toBe(1);
    expect(FakeAudioContext.instances[0].closed).toBe(false);
  });

  it("disconnects every one-shot node when its source ends", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.playStampSound();
    sound.playWhooshSound();
    const ctx = FakeAudioContext.instances[0];
    expect(sound.getAudioDebug().activeNodes).toBeGreaterThan(0);
    const started = ctx.nodes.filter((n) => n.started);
    endAllSources(ctx);
    expect(sound.getAudioDebug().activeNodes).toBe(0);
    for (const n of started) expect(n.disconnected).toBe(true);
  });

  it("master mute silences effects and ramps the master gain (and so the music) to zero", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startAmbientMusic();
    const ctx = FakeAudioContext.instances[0];
    const master = ctx.gains[MASTER].gain;
    const music = ctx.gains[MUSIC];
    expect(music.connections).toContain(ctx.gains[MASTER]);

    sound.setMuted(true);
    expect(master.lastTarget()).toBe(0);
    expect(sound.getAudioDebug().busGains.master).toBe(0);
    expect(sound.isAudioMuted()).toBe(true);

    const oscillatorsBefore = ctx.oscillators.length;
    sound.playClickSound();
    sound.playRedAlertSiren();
    expect(ctx.oscillators.length).toBe(oscillatorsBefore);

    sound.setMuted(false);
    expect(master.lastTarget()).toBe(1);
    sound.playClickSound();
    expect(ctx.oscillators.length).toBeGreaterThan(oscillatorsBefore);
  });

  it("music mute silences only the music bus", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startAmbientMusic();
    const ctx = FakeAudioContext.instances[0];
    sound.setMusicMuted(true);
    expect(ctx.gains[MUSIC].gain.lastTarget()).toBe(0);
    expect(ctx.gains[MASTER].gain.lastTarget()).toBe(1);
    expect(sound.getAudioDebug().busGains.music).toBe(0);
    expect(sound.getAudioDebug().busGains.sfx).toBe(1);
  });

  it("persists settings under the existing storage keys and reads them back", async () => {
    localStorage.setItem("incidentzero.audio_volume", "0.3");
    localStorage.setItem("incidentzero.music_muted", "true");
    const sound = await loadSound();
    expect(sound.getAudioSettings()).toEqual({ volume: 0.3, muted: false });
    expect(sound.getMusicSettings()).toEqual({ volume: 0.5, muted: true });
    sound.setMuted(true);
    sound.setMusicVolume(0.8);
    expect(localStorage.getItem("incidentzero.audio_muted")).toBe("true");
    expect(localStorage.getItem("incidentzero.music_volume")).toBe("0.8");
  });

  it("rate-limits hover ticks to one per 60 ms and type ticks to one per 28 ms", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    const ctx = FakeAudioContext.instances[0];
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    for (let i = 0; i < 6; i++) {
      now += 10;
      sound.playUiHoverSound();
    }
    // 6 hovers over 60 ms: the first plays, the rest are inside its window
    expect(ctx.oscillators).toHaveLength(1);
    now += 61;
    sound.playUiHoverSound();
    expect(ctx.oscillators).toHaveLength(2);

    const before = ctx.oscillators.length;
    sound.playTypeTick();
    now += 5;
    sound.playTypeTick();
    expect(ctx.oscillators.length - before).toBe(1);
    now += 30;
    sound.playTypeTick();
    expect(ctx.oscillators.length - before).toBe(2);
  });

  it("caps concurrent one-shot voices instead of piling them up", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    for (let i = 0; i < 200; i++) sound.playKeyboardClatter();
    expect(sound.getAudioDebug().activeNodes).toBeLessThanOrEqual(48);
  });

  it("starts in the menu mode and cross-fades layers with smooth ramps on mode changes", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startAmbientMusic();
    const ctx = FakeAudioContext.instances[0];
    expect(sound.isMusicPlaying()).toBe(true);
    let layers = sound.getAudioDebug().music.layers;
    expect(layers).toMatchObject({ menu: 1, game: 0, tension: 0, level: 1 });

    const callsBefore = new Set(targetCalls(ctx));
    sound.setMusicMode("game");
    layers = sound.getAudioDebug().music.layers;
    expect(layers).toMatchObject({ menu: 0, game: 1, tension: 1, level: 1, cutoffHz: 18000 });
    const crossfade = targetCalls(ctx).filter((c) => !callsBefore.has(c));
    // ~1.5 s: three time constants of 0.5 s
    expect(crossfade.length).toBeGreaterThanOrEqual(5);
    expect(crossfade.every((c) => c.args[2] === 0.5)).toBe(true);
    expect(crossfade.some((c) => c.args[0] === 1)).toBe(true);
    expect(crossfade.some((c) => c.args[0] === 0)).toBe(true);

    sound.setMusicMode("paused");
    layers = sound.getAudioDebug().music.layers;
    expect(layers).toMatchObject({ menu: 0, game: 1, tension: 0.5, level: 0.5, cutoffHz: 700 });
    expect(targetCalls(ctx).some((c) => c.args[0] === 700)).toBe(true);
    expect(sound.getAudioDebug().music.mode).toBe("paused");
  });

  it("scales the tension layers by tension and DEFCON", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startAmbientMusic();
    expect(sound.getAudioDebug().music.intensity).toBe(0);
    sound.setMusicTension("tense");
    expect(sound.getAudioDebug().music.intensity).toBe(0.5);
    sound.setMusicDefcon(1);
    expect(sound.getAudioDebug().music.intensity).toBe(1);
    sound.setMusicTension("calm");
    sound.setMusicDefcon(3);
    expect(sound.getAudioDebug().music.intensity).toBe(0.45);
  });

  it("ducks the music by 6 dB under stingers and releases it afterwards", async () => {
    vi.useFakeTimers();
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startAmbientMusic();
    expect(sound.getAudioDebug().music.layers.duck).toBe(1);
    sound.playVictoryFanfare();
    expect(sound.getAudioDebug().music.layers.duck).toBe(0.5);
    vi.advanceTimersByTime(3000);
    expect(sound.getAudioDebug().music.layers.duck).toBe(1);
    sound.duckMusic(500);
    expect(sound.getAudioDebug().music.layers.duck).toBe(0.5);
  });

  it("tears down every music source and node on stop", async () => {
    vi.useFakeTimers();
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startAmbientMusic();
    const ctx = FakeAudioContext.instances[0];
    sound.stopAmbientMusic();
    expect(sound.isMusicPlaying()).toBe(false);
    vi.advanceTimersByTime(1000);
    const sources = ctx.nodes.filter((n) => n.started);
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.every((n) => n.stopped)).toBe(true);
    expect(ctx.closed).toBe(false);
  });

  it("silences a looping alarm instantly and revives it on the next cycle", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.playRedAlertSiren();
    const ctx = FakeAudioContext.instances[0];
    const siren = ctx.gains[4].gain;
    sound.stopRedAlertSiren();
    expect(siren.lastTarget()).toBe(0);
    sound.playRedAlertSiren();
    expect(siren.lastTarget()).toBe(1);
  });
});
