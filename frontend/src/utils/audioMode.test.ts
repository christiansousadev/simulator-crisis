import { describe, expect, it } from "vitest";
import { deriveMusicMode, isGameplayActive, type AudioAppState } from "./audioMode";
import { computeMusicIntensity } from "./musicEngine";

const playing: AudioAppState = {
  titleScreenVisible: false,
  pauseMenuOpen: false,
  settingsOpen: false,
  isRunning: true,
  status: "running",
};

describe("deriveMusicMode", () => {
  it("plays the menu theme on the title screen, even if the sim claims to run", () => {
    expect(deriveMusicMode({ ...playing, titleScreenVisible: true })).toBe("menu");
  });
  it("muffles the bed when paused, stopped or finished", () => {
    expect(deriveMusicMode({ ...playing, pauseMenuOpen: true })).toBe("paused");
    expect(deriveMusicMode({ ...playing, isRunning: false })).toBe("paused");
    expect(deriveMusicMode({ ...playing, status: "bankrupted" })).toBe("paused");
    expect(deriveMusicMode({ ...playing, status: "victory" })).toBe("paused");
  });
  it("uses the full bed while playing, including with settings open", () => {
    expect(deriveMusicMode(playing)).toBe("game");
    expect(deriveMusicMode({ ...playing, settingsOpen: true })).toBe("game");
  });
});

describe("isGameplayActive", () => {
  it("is true only while the game is truly in play", () => {
    expect(isGameplayActive(playing)).toBe(true);
    expect(isGameplayActive({ ...playing, titleScreenVisible: true })).toBe(false);
    expect(isGameplayActive({ ...playing, pauseMenuOpen: true })).toBe(false);
    expect(isGameplayActive({ ...playing, settingsOpen: true })).toBe(false);
    expect(isGameplayActive({ ...playing, isRunning: false })).toBe(false);
    expect(isGameplayActive({ ...playing, status: "bankrupted" })).toBe(false);
  });
});

describe("computeMusicIntensity", () => {
  it("takes the louder of tension and DEFCON", () => {
    expect(computeMusicIntensity("calm", 5)).toBe(0);
    expect(computeMusicIntensity("tense", 5)).toBe(0.5);
    expect(computeMusicIntensity("calm", 1)).toBe(1);
    expect(computeMusicIntensity("critical", 4)).toBe(1);
  });
});
