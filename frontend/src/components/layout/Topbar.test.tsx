import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import { formatPrestigeBadge, HallOfFameButton } from "./Topbar";

function setPrestige(points: number) {
  const telemetry = useGameStore.getState().telemetry;
  useGameStore.setState({ telemetry: { ...telemetry, prestige_points: points } });
}

beforeEach(() => {
  useGameStore.setState({ language: "en", hallOfFameOpen: false });
  setPrestige(0);
});

afterEach(() => {
  useGameStore.setState({ hallOfFameOpen: false });
});

describe("formatPrestigeBadge", () => {
  it("keeps the badge narrow for veteran balances", () => {
    expect(formatPrestigeBadge(0)).toBe("0");
    expect(formatPrestigeBadge(950)).toBe("950");
    expect(formatPrestigeBadge(1000)).toBe("1k");
    expect(formatPrestigeBadge(1250)).toBe("1.2k");
    expect(formatPrestigeBadge(9999)).toBe("9.9k");
    expect(formatPrestigeBadge(12_500)).toBe("12k");
    expect(formatPrestigeBadge(-5)).toBe("0");
  });
});

describe("HallOfFameButton", () => {
  it("shows no badge while there is no prestige to spend", () => {
    render(<HallOfFameButton />);
    expect(screen.getByRole("button", { name: "Hall of Fame" })).toBeInTheDocument();
    expect(screen.queryByTestId("prestige-badge")).toBeNull();
  });

  it("shows the balance as a badge and names it for assistive tech", () => {
    setPrestige(250);
    render(<HallOfFameButton />);
    expect(screen.getByTestId("prestige-badge")).toHaveTextContent("250");
    expect(screen.getByRole("button", { name: /250 prestige points to spend on office decor/ })).toBeInTheDocument();
  });

  it("tracks the balance live and replays the bump animation on every change", () => {
    setPrestige(100);
    render(<HallOfFameButton />);
    const first = screen.getByTestId("prestige-badge");
    expect(first).toHaveClass("animate-badge-bump");
    act(() => setPrestige(1400));
    const second = screen.getByTestId("prestige-badge");
    expect(second).toHaveTextContent("1.4k");
    // keyed on the balance: a fresh node, so the css animation runs again
    expect(second).not.toBe(first);
    act(() => setPrestige(0));
    expect(screen.queryByTestId("prestige-badge")).toBeNull();
  });

  it("opens the Hall of Fame", async () => {
    setPrestige(50);
    render(<HallOfFameButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(useGameStore.getState().hallOfFameOpen).toBe(true);
  });
});
