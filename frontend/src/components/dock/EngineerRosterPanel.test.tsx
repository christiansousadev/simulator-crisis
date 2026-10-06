import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPending } from "../../hooks/useAsyncAction";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { Engineer } from "../../types/game";
import EngineerRosterPanel from "./EngineerRosterPanel";

vi.mock("../../services/api", () => ({
  api: { hireEngineer: vi.fn(), rotateShift: vi.fn() },
}));
vi.mock("../../utils/sound", () => ({
  playCashSound: vi.fn(),
  playClickSound: vi.fn(),
  playErrorSound: vi.fn(),
}));

const engineer = (id: string, assigned: string | null, competency: Engineer["core_competency"]): Engineer => ({
  id,
  session_id: "s",
  name: `Eng ${id}`,
  assigned_service_id: assigned,
  core_competency: competency,
  stress_index: 10,
  stamina: 90,
  on_call_status: "on_duty",
  hired_at_tick: 1,
});

function setRoster(engineers: Engineer[], budget = 100_000) {
  useGameStore.setState({
    language: "en",
    telemetry: { ...useGameStore.getState().telemetry, engineers, budget },
  });
}

// the localized grouping separator depends on the runtime locale, as in the app itself
const usd = (n: number) => `$${n.toLocaleString()}`;

beforeEach(() => {
  clearPending("hire-engineer");
  vi.mocked(api.hireEngineer).mockReset();
  vi.mocked(api.hireEngineer).mockResolvedValue({ success: true, engineer: engineer("new", null, "auth"), budget: 85_000 });
});

describe("EngineerRosterPanel hiring", () => {
  it("pre-selects the first vacant service and its specialist, and hires onto that service", () => {
    setRoster([engineer("a", "srv-auth", "auth")]);
    render(<EngineerRosterPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hire Engineer/ }));

    const select = screen.getByLabelText("Covers service") as HTMLSelectElement;
    expect(select.value).toBe("srv-payment");
    expect(screen.getByRole("button", { name: "Payments" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("hire-consequence")).toHaveTextContent("Specialist: full effect");

    fireEvent.click(screen.getByRole("button", { name: /^Hire \(/ }));
    expect(api.hireEngineer).toHaveBeenCalledWith("payments", "srv-payment");
  });

  it("warns about the off-specialty penalty and still sends the chosen service", () => {
    setRoster([]);
    render(<EngineerRosterPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hire Engineer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Database" }));

    expect(screen.getByTestId("hire-consequence")).toHaveTextContent("Off-specialty: 0.45 quality");
    fireEvent.click(screen.getByRole("button", { name: /^Hire \(/ }));
    expect(api.hireEngineer).toHaveBeenCalledWith("db", "srv-auth");
  });

  it("re-aligns the specialty when another service is picked and marks matches as recommended", () => {
    setRoster([]);
    render(<EngineerRosterPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hire Engineer/ }));
    fireEvent.change(screen.getByLabelText("Covers service"), { target: { value: "srv-search" } });

    expect(screen.getByRole("button", { name: "Gateway" })).toHaveAttribute("aria-pressed", "true");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Search (recommended, no coverage)");
    expect(options).toContain("Authentication (no coverage)");
  });

  it("shows which service each engineer covers and the vacancies", () => {
    setRoster([engineer("a", "srv-auth", "auth"), engineer("b", null, "db")]);
    render(<EngineerRosterPanel />);
    const lines = screen.getAllByTestId("engineer-coverage").map((n) => n.textContent);
    expect(lines).toContain("Covers Authentication");
    expect(lines).toContain("Reserve desk (no service)");
    expect(screen.getByTestId("roster-vacancies")).toHaveTextContent("Payment Gateway");
    expect(screen.getByTestId("roster-vacancies")).not.toHaveTextContent("Authentication");
  });

  it("disables hiring with a readable reason when cash is short", () => {
    setRoster([], 4_000);
    render(<EngineerRosterPanel />);
    const open = screen.getByRole("button", { name: /Hire Engineer/ });
    expect(open).toBeDisabled();
    expect(screen.getByText(/Not enough cash/)).toHaveTextContent(`${usd(11_000)} short`);
    expect(open).toHaveAccessibleDescription(/Not enough cash/);
  });

  it("cancel closes the form without hiring", () => {
    setRoster([]);
    render(<EngineerRosterPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hire Engineer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("hire-form")).toBeNull();
    expect(api.hireEngineer).not.toHaveBeenCalled();
  });
});
