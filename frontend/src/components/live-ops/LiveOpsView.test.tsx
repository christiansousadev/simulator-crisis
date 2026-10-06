import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IncidentsPanel from "../dock/IncidentsPanel";
import { useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import LiveOpsView from "./LiveOpsView";

// the observer must never open a socket in a unit test, and it must not need one to render
vi.mock("../../hooks/useSimulationSocket", () => ({ useSimulationSocket: vi.fn() }));

const incident: Incident = {
  id: "inc-1",
  session_id: "s",
  service_id: "srv-auth",
  severity: "P1_CRITICAL",
  title: "Memory leak in auth workers",
  root_cause: null,
  mtta_seconds: 0,
  mttr_seconds: 0,
  status: "active",
  created_tick: 1,
  acknowledged_tick: null,
  resolved_tick: null,
  triage_solved: false,
};

beforeEach(() => {
  useGameStore.setState({
    language: "en",
    telemetry: { ...useGameStore.getState().telemetry, active_incidents: [incident], tick: 4 },
  });
});

describe("IncidentsPanel readOnly", () => {
  it("normal mode keeps the acknowledge and open-briefing buttons", () => {
    render(<IncidentsPanel />);
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open incident briefing/ })).toBeInTheDocument();
  });

  it("read-only mode renders the incident as a status card with no buttons at all", () => {
    const { container } = render(<IncidentsPanel readOnly />);
    expect(screen.getByText("Memory leak in auth workers")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector('[data-stretched="true"]')).toBeNull();
  });
});

describe("LiveOpsView", () => {
  it("is an observer: labelled read-only, shows the incident, exposes no command buttons", () => {
    render(<LiveOpsView />);
    expect(screen.getByTestId("observer-badge")).toHaveTextContent("Observer mode — read only");
    expect(screen.getByText("Memory leak in auth workers")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
