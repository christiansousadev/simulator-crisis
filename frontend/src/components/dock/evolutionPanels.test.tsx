import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import type { CausalChain, Incident, StakeholderMessage } from "../../types/game";
import CausalChainView from "../modals/CausalChainView";
import AcademyModal from "../tutorial/AcademyModal";
import WarRoomPanel from "./WarRoomPanel";

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "inc-1",
    session_id: "s",
    service_id: "srv-auth",
    severity: "P1_CRITICAL",
    title: "t",
    root_cause: null,
    mtta_seconds: 0,
    mttr_seconds: 0,
    status: "active",
    created_tick: 0,
    acknowledged_tick: null,
    resolved_tick: null,
    triage_solved: false,
    status_page_rank: 0,
    ...over,
  };
}

function message(over: Partial<StakeholderMessage> = {}): StakeholderMessage {
  return { id: "m1", tick: 2, incident_id: "inc-1", service_id: "srv-auth", severity: "P1_CRITICAL", kind: "ceo_inquiry", sender: "CEO", answered: false, ...over };
}

function setTelemetry(patch: Record<string, unknown>) {
  const state = useGameStore.getState();
  useGameStore.setState({ telemetry: { ...state.telemetry, ...patch } as typeof state.telemetry });
}

beforeEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState({ language: "en", academyOpen: false, academyDone: [] });
});

describe("WarRoomPanel", () => {
  it("shows the empty feed and the no-incident state on a quiet floor", () => {
    setTelemetry({ stakeholder_feed: [], active_incidents: [] });
    render(<WarRoomPanel />);
    expect(screen.getByText(/All quiet/)).toBeInTheDocument();
    expect(screen.getByText("No open incident needs a public update.")).toBeInTheDocument();
  });

  it("renders stakeholder messages with the service name and flags the unanswered ones", () => {
    setTelemetry({ stakeholder_feed: [message()], active_incidents: [incident()], tick: 3 });
    render(<WarRoomPanel />);
    expect(screen.getByText("CEO")).toBeInTheDocument();
    expect(screen.getByText("Awaiting your update")).toBeInTheDocument();
    expect(screen.getByText(/Why is .* down\?/)).toBeInTheDocument();
  });

  it("posts a status update through the api and marks stages already posted as done", async () => {
    setTelemetry({ stakeholder_feed: [], active_incidents: [incident({ status_page_rank: 1 })], tick: 1 });
    const post = vi.spyOn(api, "postStatusUpdate").mockResolvedValue({ success: true, truthful: true, stage: "identified", happiness_delta: 2, reputation_delta: 0 });
    render(<WarRoomPanel />);
    expect(screen.getByRole("button", { name: /Investigating — Posted/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: 'Post "Cause identified"' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("inc-1", "identified"));
  });

  it("warns about silence on a serious incident that nobody announced", () => {
    setTelemetry({ stakeholder_feed: [], active_incidents: [incident({ created_tick: 0 })], tick: 9 });
    render(<WarRoomPanel />);
    expect(screen.getByText(/Customers are hearing nothing/)).toBeInTheDocument();
  });
});

describe("CausalChainView", () => {
  const chain: CausalChain = {
    service_id: "srv-auth",
    root_cause: "OOM killer invoked by kernel",
    cause_category: "capacity_saturation",
    downstream_service_ids: ["srv-payment", "srv-api-gw"],
    best_runbook_id: "scale_replicas",
    runbooks_used: ["Rollback Canary"],
    fully_resolved: false,
  };

  it("lays out cause, service, downstream services and the best-fit runbook", () => {
    render(<CausalChainView chain={chain} />);
    expect(screen.getByText("Saturated capacity")).toBeInTheDocument();
    expect(screen.getByText(/Best-fit runbook for this cause/)).toBeInTheDocument();
    expect(screen.getByText(/Runbooks used: Rollback Canary/)).toBeInTheDocument();
  });

  it("does not assert a cause that was never confirmed", () => {
    render(<CausalChainView chain={{ ...chain, cause_category: null, best_runbook_id: null, runbooks_used: [] }} />);
    expect(screen.getAllByText(/was not confirmed/).length).toBeGreaterThan(0);
    expect(screen.getByText("No runbook was executed for this incident.")).toBeInTheDocument();
  });

  it("falls back to a calm message when the backend sent no chain", () => {
    render(<CausalChainView chain={null} />);
    expect(screen.getByText(/was not confirmed/)).toBeInTheDocument();
  });
});

describe("AcademyModal", () => {
  it("lists four modules, marks the finished ones and starts the chosen one", () => {
    useGameStore.setState({ academyOpen: true, academyDone: [2] });
    render(<AcademyModal />);
    expect(screen.getByText("1 of 4 modules completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replay: Module 2/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start: Module 4/ }));
    const state = useGameStore.getState();
    expect(state.onboardingOpen).toBe(true);
    expect(state.academyOpen).toBe(false);
    expect(state.tutorial.stepIndex).toBeGreaterThan(0);
    useGameStore.getState().closeOnboarding();
  });
});
