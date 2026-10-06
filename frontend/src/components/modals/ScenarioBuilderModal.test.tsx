import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import { decodeChallengeCode } from "../../utils/scenarioConfig";
import ScenarioBuilderModal from "./ScenarioBuilderModal";

vi.mock("../../utils/launchFlow", () => ({ launchCustomScenario: vi.fn() }));

beforeEach(() => {
  useGameStore.setState({ language: "en", scenarioBuilderOpen: true });
});

describe("ScenarioBuilderModal starting conditions", () => {
  it("starts on the difficulty defaults and exposes both toggles", () => {
    render(<ScenarioBuilderModal />);
    const toggles = screen.getAllByLabelText("Use difficulty default") as HTMLInputElement[];
    expect(toggles).toHaveLength(2);
    expect(toggles.every((t) => t.checked)).toBe(true);
    expect(screen.getByText(`Default: $${(250_000).toLocaleString()}`)).toBeInTheDocument();
    expect(screen.getByText("Default: 25")).toBeInTheDocument();
  });

  it("switching a toggle off reveals a slider and flags a start at or below the floor", () => {
    render(<ScenarioBuilderModal />);
    const [budgetToggle] = screen.getAllByLabelText("Use difficulty default");
    fireEvent.click(budgetToggle);
    const slider = screen.getByLabelText("Starting Budget ($)") as HTMLInputElement;
    expect(slider.value).toBe("250000");

    // floor 20,000 by default: drag the start to the slider minimum 10,000, which is below it
    fireEvent.change(slider, { target: { value: "10000" } });
    expect(screen.getByRole("alert")).toHaveTextContent(`above the budget floor ($${(20_000).toLocaleString()})`);

    fireEvent.change(slider, { target: { value: "300000" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exports the chosen values in the challenge code", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ScenarioBuilderModal />);
    const [budgetToggle, debtToggle] = screen.getAllByLabelText("Use difficulty default");
    fireEvent.click(budgetToggle);
    fireEvent.click(debtToggle);
    fireEvent.change(screen.getByLabelText("Starting Tech Debt (TDI)"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /Copy Challenge Code/ }));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(decodeChallengeCode(writeText.mock.calls[0][0])).toMatchObject({ starting_budget: 250_000, starting_tech_debt: 60 });
  });
});
