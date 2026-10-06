import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGameStore } from "../store/useGameStore";
import { translateDifficulty } from "./dynamicContent";
import { loadLanguage } from "./loadLanguage";
import { isLanguageReady, TRANSLATIONS } from "./translations";

describe("loadLanguage", () => {
  it("english is always ready", async () => {
    expect(isLanguageReady("en")).toBe(true);
    await expect(loadLanguage("en")).resolves.toBeUndefined();
  });

  it("registers the dictionary and the dynamic tables for a lazy language", async () => {
    // before loading, the accessor degrades to english instead of returning undefined
    expect(TRANSLATIONS.es).toBeDefined();
    await loadLanguage("pt-BR");
    expect(isLanguageReady("pt-BR")).toBe(true);
    expect(TRANSLATIONS["pt-BR"]).not.toBe(TRANSLATIONS.en);
    expect(TRANSLATIONS["pt-BR"].hud.common.loading).not.toBe(TRANSLATIONS.en.hud.common.loading);
    expect(translateDifficulty("intern", "pt-BR")).toBe("ESTAGIÁRIO");
  });

  it("shares one in-flight load between concurrent callers", async () => {
    await Promise.all([loadLanguage("es"), loadLanguage("es")]);
    expect(translateDifficulty("standard", "es")).toBe("ESTÁNDAR");
  });

  it("the store switches language only after the dictionary is registered", async () => {
    useGameStore.setState({ language: "en" });
    useGameStore.getState().setLanguage("es");
    // es may already be cached by the previous test; either way the language is never set while unready
    await waitFor(() => expect(useGameStore.getState().language).toBe("es"));
    expect(isLanguageReady("es")).toBe(true);
    useGameStore.getState().setLanguage("en");
    expect(useGameStore.getState().language).toBe("en");
  });
});
