import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import CABDilemmaModal from "./CABDilemmaModal";
import LogTriageTerminal from "./LogTriageTerminal";
import PostMortemModal from "./PostMortemModal";

const dilemma = {
  dilemma_id: "d1",
  title: "Some Dilemma",
  narrative: "Decide now.",
  expires_at_tick: 40,
  choices: [
    { id: "a", label: "Option A", budget_delta: -500, tech_debt_delta: 2, happiness_delta: 1, reputation_delta: 0 },
    { id: "b", label: "Option B", budget_delta: 300, tech_debt_delta: -1, happiness_delta: 0, reputation_delta: 2 },
  ],
};

beforeEach(() => {
  useGameStore.setState({ activeDilemma: null, triageIncidentId: null, postMortem: null });
});

describe("CABDilemmaModal", () => {
  it("is a must-answer alertdialog: no close button, Escape does nothing, choices work", async () => {
    vi.spyOn(api, "resolveDilemma").mockResolvedValue({ success: true, choice_id: "a", budget: 1, tech_debt: 1 });
    useGameStore.setState({ activeDilemma: dilemma });
    render(<CABDilemmaModal />);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close|fechar|cerrar/i })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Option A/ }));
    expect(api.resolveDilemma).toHaveBeenCalledWith("d1", "a");
    expect(await screen.findByText(/board decided/i)).toBeInTheDocument();
  });
});

describe("LogTriageTerminal", () => {
  it("renders real buttons for log lines and submits on click", async () => {
    vi.spyOn(api, "getIncidentLogs").mockResolvedValue({
      lines: [
        { id: "l1", tick_offset: 1, level: "INFO", message: "service started" },
        { id: "l2", tick_offset: 2, level: "ERROR", message: "connection refused" },
      ],
    });
    const submit = vi.spyOn(api, "submitTriage").mockResolvedValue({ success: true, correct: false });
    useGameStore.setState({ reducedMotionPref: "on", triageIncidentId: "inc-1" });
    render(<LogTriageTerminal />);
    const row = await screen.findByRole("button", { name: /connection refused/ });
    await userEvent.click(row);
    expect(submit).toHaveBeenCalledWith("inc-1", "l2");
    expect(screen.getByRole("button", { name: /connection refused/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Attempts: 1/)).toBeInTheDocument();
  });
});

describe("PostMortemModal", () => {
  it("renders the markdown as a document", async () => {
    useGameStore.setState({ postMortem: { incidentId: "inc-1", markdown: "# Report\n\n- **T+1:** created" } });
    render(<PostMortemModal />);
    expect(await screen.findByRole("heading", { name: "Report" })).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });
});
