import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext, FakeParam, installFakeAudio, uninstallFakeAudio } from "../test/fakeAudio";

type SoundModule = typeof import("./sound");

async function loadSound(): Promise<SoundModule> {
  vi.resetModules();
  return import("./sound");
}

describe("master chain and datacenter ambience", () => {
  beforeEach(() => {
    localStorage.clear();
    installFakeAudio();
  });
  afterEach(() => {
    uninstallFakeAudio();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("routes the master through a rumble cut and a comfort shelf into the limiter", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    const ctx = FakeAudioContext.instances[0];
    const types = ctx.nodes.map((n) => (n as unknown as { type?: string }).type).filter(Boolean);
    expect(types).toContain("highpass");
    expect(types).toContain("highshelf");
    const compressors = ctx.nodes.filter((n) => "threshold" in n);
    expect(compressors).toHaveLength(1);
  });

  it("starts once, idempotently, and only after a user gesture", async () => {
    const sound = await loadSound();
    sound.startDatacenterAmbience();
    expect(sound.isAmbiencePlaying()).toBe(false);
    sound.unlockAudio();
    sound.startDatacenterAmbience();
    sound.startDatacenterAmbience();
    expect(sound.isAmbiencePlaying()).toBe(true);
    const ctx = FakeAudioContext.instances[0];
    // one noise hiss + two fan drones
    expect(ctx.oscillators.filter((o) => (o as unknown as { type: string }).type === "sawtooth")).toHaveLength(2);
  });

  it("spins the fans up and opens the hiss as tension rises", async () => {
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startDatacenterAmbience();
    const ctx = FakeAudioContext.instances[0];
    const fan = ctx.oscillators.find((o) => (o as unknown as { type: string }).type === "sawtooth")!;
    const targets = () => (fan.frequency as unknown as FakeParam).calls.filter((c) => c.type === "target");
    const before = targets().length;
    sound.setAmbienceTension(1);
    expect(targets().length).toBeGreaterThan(before);
    expect(targets()[targets().length - 1].args[0]).toBeGreaterThan(54);
    // out-of-range and non-finite input is clamped, never thrown on
    expect(() => sound.setAmbienceTension(9)).not.toThrow();
    expect(() => sound.setAmbienceTension(Number.NaN)).not.toThrow();
  });

  it("fades out and releases every source on stop", async () => {
    vi.useFakeTimers();
    const sound = await loadSound();
    sound.unlockAudio();
    sound.startDatacenterAmbience();
    sound.stopDatacenterAmbience();
    expect(sound.isAmbiencePlaying()).toBe(false);
    vi.advanceTimersByTime(1000);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.oscillators.every((o) => o.stopped)).toBe(true);
  });
});
