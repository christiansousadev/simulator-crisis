import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLanguage } from "../../i18n/loadLanguage";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import type { CareerRecord, CareerSummary, CosmeticCatalogEntry } from "../../types/game";
import HallOfFameModal from "./HallOfFameModal";

vi.mock("../../utils/sound", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../utils/sound")>();
  return { ...mod, playUiConfirmSound: vi.fn(), playUiHoverSound: vi.fn() };
});

// the backend catalog carries english copy only (app.engine.cosmetics.COSMETIC_CATALOG)
const CATALOG: CosmeticCatalogEntry[] = [
  { id: "golden_coffee_machine", name: "Golden Coffee Machine", description: "A gilded reskin of the breakroom espresso machine.", prestige_cost: 200 },
  { id: "executive_leather_sofa", name: "Executive Leather Sofa", description: "A premium reskin of the breakroom lounge sofa.", prestige_cost: 150 },
  { id: "marble_reception_desk", name: "Marble Reception Desk", description: "A premium reskin of the reception counter.", prestige_cost: 300 },
];

const RECORD: CareerRecord = {
  id: "rec-1",
  player_id: "player-abcdef123",
  scenario_id: "black_friday_rush",
  difficulty: "standard",
  outcome: "victory",
  days_survived: 7,
  final_sla_percentage: 99.95,
  final_budget: 42_000,
  prestige_earned: 120,
  recorded_at: "2026-11-01T12:00:00Z",
  final_tech_debt: 12,
  final_reputation: 80,
  incidents_total: 9,
  incidents_resolved: 8,
  scenario_outcome: null,
  objectives: [{ id: "obj-sla", description: "Keep SLA above 99.9%", done: true } as NonNullable<CareerRecord["objectives"]>[number]],
};

const SUMMARY = {
  total_runs: 3,
  victories: 1,
  bankruptcies: 1,
  defeats: 1,
  total_incidents_resolved: 20,
  lifetime_prestige: 640,
  operator_rank: "Senior SRE",
  operator_rank_key: "senior_sre",
  best_runs: {},
  recommended_challenge: null,
} as unknown as CareerSummary;

function setCareer(prestige: number, unlocked: string[] = []) {
  const telemetry = useGameStore.getState().telemetry;
  useGameStore.setState({ telemetry: { ...telemetry, prestige_points: prestige, unlocked_cosmetics: unlocked } });
}

// flush the mocked fetches (records, summary, catalog) and their .then/.finally hops inside act, so
// every state update they cause lands before the next assertion
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function renderModal() {
  const utils = render(<HallOfFameModal />);
  await settle();
  return utils;
}

async function openShop() {
  await renderModal();
  await userEvent.click(await screen.findByRole("tab", { name: /Office Decor Shop/i }));
  return screen.getByRole("tabpanel");
}

beforeEach(() => {
  vi.spyOn(api, "getCareerRecords").mockResolvedValue([RECORD]);
  vi.spyOn(api, "getGlobalCareerRecords").mockResolvedValue([RECORD]);
  vi.spyOn(api, "getCareerSummary").mockResolvedValue(SUMMARY);
  vi.spyOn(api, "getCosmeticCatalog").mockResolvedValue(CATALOG);
  useGameStore.setState({ language: "en", hallOfFameOpen: true });
  setCareer(0);
});

afterEach(() => {
  // unmount before touching the store, or the reset below re-renders a live modal outside act
  cleanup();
  vi.restoreAllMocks();
  useGameStore.setState({ language: "en", hallOfFameOpen: false });
});

describe("HallOfFameModal: opening and rankings", () => {
  it("renders nothing while hallOfFameOpen is false", () => {
    useGameStore.setState({ hallOfFameOpen: false });
    render(<HallOfFameModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.getCareerRecords).not.toHaveBeenCalled();
  });

  it("opens on hallOfFameOpen: true and loads the career records with the rankings tab selected", async () => {
    await renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Leaderboards/i })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("BLACK FRIDAY RUSH")).toBeInTheDocument();
    expect(api.getCareerRecords).toHaveBeenCalledWith("recorded_at", undefined);
    expect(screen.getByText(/Senior SRE/)).toBeInTheDocument();
  });

  it("expands a record to show its objectives snapshot", async () => {
    await renderModal();
    const row = await screen.findByRole("button", { name: /BLACK FRIDAY RUSH/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Objectives Snapshot")).toBeInTheDocument();
  });

  it("switches to the global leaderboard", async () => {
    await renderModal();
    await screen.findByText("BLACK FRIDAY RUSH");
    await userEvent.click(screen.getByRole("button", { name: /Global/ }));
    await settle();
    expect(api.getGlobalCareerRecords).toHaveBeenCalledWith("days_survived");
  });

  it("shows a retry state when the records request fails", async () => {
    vi.mocked(api.getCareerRecords).mockRejectedValueOnce(new Error("offline"));
    await renderModal();
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    await userEvent.click(retry);
    await settle();
    expect(screen.getByText("BLACK FRIDAY RUSH")).toBeInTheDocument();
    expect(api.getCareerRecords).toHaveBeenCalledTimes(2);
  });

  it("fetches the cosmetic catalog once per opening, not on every leaderboard filter change", async () => {
    await renderModal();
    await screen.findByText("BLACK FRIDAY RUSH");
    await userEvent.click(screen.getByRole("button", { name: /Global/ }));
    await userEvent.click(screen.getByRole("button", { name: /My Records/ }));
    await settle();
    expect(api.getCareerRecords).toHaveBeenCalledTimes(2);
    expect(api.getCosmeticCatalog).toHaveBeenCalledTimes(1);
  });
});

describe("HallOfFameModal: tabs", () => {
  it("toggles between Rankings and the Decor Shop, wiring each tab to its panel", async () => {
    await renderModal();
    const rankings = screen.getByRole("tab", { name: /Leaderboards/i });
    const shopTab = screen.getByRole("tab", { name: /Office Decor Shop/i });
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", rankings.id);

    await userEvent.click(shopTab);
    expect(shopTab).toHaveAttribute("aria-selected", "true");
    expect(rankings).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", shopTab.id);
    expect(screen.getByRole("heading", { name: "Office Decor & Cosmetics" })).toBeInTheDocument();

    await userEvent.click(rankings);
    expect(rankings).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("BLACK FRIDAY RUSH")).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys (roving tabindex)", async () => {
    await renderModal();
    const rankings = screen.getByRole("tab", { name: /Leaderboards/i });
    const shopTab = screen.getByRole("tab", { name: /Office Decor Shop/i });
    expect(rankings).toHaveAttribute("tabindex", "0");
    expect(shopTab).toHaveAttribute("tabindex", "-1");

    rankings.focus();
    fireEvent.keyDown(rankings, { key: "ArrowRight" });
    expect(shopTab).toHaveAttribute("aria-selected", "true");
    expect(shopTab).toHaveFocus();
    fireEvent.keyDown(shopTab, { key: "Home" });
    expect(rankings).toHaveAttribute("aria-selected", "true");
    expect(rankings).toHaveFocus();
  });
});

describe("HallOfFameModal: cosmetics shop", () => {
  it("renders every catalog entry with its cost", async () => {
    setCareer(1000);
    const panel = await openShop();
    for (const [id, name, cost] of [
      ["golden_coffee_machine", "Golden Coffee Machine", 200],
      ["executive_leather_sofa", "Executive Leather Sofa", 150],
      ["marble_reception_desk", "Marble Reception Desk", 300],
    ] as const) {
      const card = within(panel).getByTestId(`cosmetic-${id}`);
      expect(within(card).getByRole("heading", { name })).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: new RegExp(`Unlock \\(${cost} pts\\)`) })).toBeEnabled();
    }
    expect(within(panel).getByText("0 / 3 installed")).toBeInTheDocument();
  });

  it("unlocks a cosmetic through api.unlockCosmetic and reactively updates balance and installed items", async () => {
    setCareer(250);
    const unlock = vi.spyOn(api, "unlockCosmetic").mockResolvedValue({ success: true, cosmetic_id: "golden_coffee_machine", prestige_points: 50 });
    const panel = await openShop();
    expect(within(panel).getByTestId("shop-balance")).toHaveTextContent("250");

    const coffee = within(panel).getByTestId("cosmetic-golden_coffee_machine");
    await userEvent.click(within(coffee).getByRole("button", { name: /Unlock/ }));

    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith("golden_coffee_machine");
    expect(useGameStore.getState().telemetry.prestige_points).toBe(50);
    expect(useGameStore.getState().telemetry.unlocked_cosmetics).toEqual(["golden_coffee_machine"]);

    expect(within(panel).getByTestId("shop-balance")).toHaveTextContent("50");
    expect(within(coffee).getByText("Installed in Office")).toBeInTheDocument();
    expect(within(coffee).queryByRole("button")).toBeNull();
    expect(within(panel).getByText("1 / 3 installed")).toBeInTheDocument();
    expect(within(panel).getByRole("status")).toHaveTextContent("Golden Coffee Machine installed in the office");

    // the 150-pt sofa is now out of reach: disabled, with the shortfall spelled out
    const sofa = within(panel).getByTestId("cosmetic-executive_leather_sofa");
    expect(within(sofa).getByRole("button", { name: /Unlock/ })).toBeDisabled();
    expect(within(sofa).getByText("100 more pts needed")).toBeInTheDocument();
  });

  it("disables what the balance cannot cover and never calls the API for it", async () => {
    setCareer(100);
    const unlock = vi.spyOn(api, "unlockCosmetic");
    const panel = await openShop();
    const marble = within(panel).getByTestId("cosmetic-marble_reception_desk");
    const button = within(marble).getByRole("button", { name: /Unlock/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("200 more pts needed");
    await userEvent.click(button);
    expect(unlock).not.toHaveBeenCalled();
  });

  it("shows items already owned as installed", async () => {
    setCareer(500, ["marble_reception_desk"]);
    const panel = await openShop();
    const marble = within(panel).getByTestId("cosmetic-marble_reception_desk");
    expect(within(marble).getByText("Installed in Office")).toBeInTheDocument();
    expect(within(panel).getByText("1 / 3 installed")).toBeInTheDocument();
  });

  it("reports a rejected unlock and leaves the balance untouched", async () => {
    setCareer(400);
    vi.spyOn(api, "unlockCosmetic").mockRejectedValue(new Error("Insufficient prestige points"));
    const panel = await openShop();
    const sofa = within(panel).getByTestId("cosmetic-executive_leather_sofa");
    await userEvent.click(within(sofa).getByRole("button", { name: /Unlock/ }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(/rejected/i);
    expect(useGameStore.getState().telemetry.prestige_points).toBe(400);
    expect(useGameStore.getState().telemetry.unlocked_cosmetics).toEqual([]);
    expect(within(sofa).getByRole("button", { name: /Unlock/ })).toBeEnabled();
  });

  it("ignores a second click while an unlock is in flight", async () => {
    setCareer(1000);
    let resolve!: (v: { success: boolean; cosmetic_id: string; prestige_points: number }) => void;
    const unlock = vi.spyOn(api, "unlockCosmetic").mockReturnValue(new Promise((r) => (resolve = r)));
    const panel = await openShop();
    const coffee = within(panel).getByTestId("cosmetic-golden_coffee_machine");
    const button = within(coffee).getByRole("button", { name: /Unlock/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(unlock).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true, cosmetic_id: "golden_coffee_machine", prestige_points: 800 }));
    expect(useGameStore.getState().telemetry.unlocked_cosmetics).toEqual(["golden_coffee_machine"]);
  });

  it("falls back to the bundled catalog when the endpoint is unreachable", async () => {
    vi.mocked(api.getCosmeticCatalog).mockRejectedValue(new Error("offline"));
    setCareer(0);
    const panel = await openShop();
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(within(panel).getByRole("heading", { name: "Marble Reception Desk" })).toBeInTheDocument();
  });

  it("localizes the shop by catalog id even though the backend sends english copy", async () => {
    await loadLanguage("pt-BR");
    useGameStore.setState({ language: "pt-BR" });
    setCareer(0);
    await renderModal();
    await userEvent.click(await screen.findByRole("tab", { name: /Loja de Decorações/ }));
    const panel = screen.getByRole("tabpanel");
    await waitFor(() => expect(api.getCosmeticCatalog).toHaveBeenCalled());
    expect(within(panel).getByRole("heading", { name: "Máquina de Café Dourada (24K)" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Balcão em Mármore Carrara" })).toBeInTheDocument();
    expect(within(panel).getByText("Faltam 150 pts")).toBeInTheDocument();
    expect(within(panel).queryByText("Golden Coffee Machine")).toBeNull();
  });
});
