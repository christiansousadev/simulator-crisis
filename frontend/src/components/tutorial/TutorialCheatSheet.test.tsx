import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TutorialCheatSheet from "./TutorialCheatSheet";
import { bestRunbookFor, effectivenessPercent, MITIGATION_EFFECTIVENESS } from "./mitigationMatrix";

describe("TutorialCheatSheet", () => {
  it("renders the 4 x 4 effectiveness matrix with the real backend numbers", () => {
    const { container } = render(<TutorialCheatSheet />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(container.querySelectorAll("tbody td")).toHaveLength(16);
    // rollback fully fixes a bad deploy; scale replicas fully fixes saturation
    expect(screen.getAllByText("100%")).toHaveLength(4);
    expect(screen.getAllByText("55%")).toHaveLength(2);
  });

  it("knows which runbook best fits each cause", () => {
    expect(bestRunbookFor("deploy_regression")).toBe("rollback");
    expect(bestRunbookFor("dependency_fault")).toBe("circuit_breaker");
    expect(bestRunbookFor("acute_defect")).toBe("emergency_patch");
    expect(effectivenessPercent("circuit_breaker", "deploy_regression")).toBe(35);
    expect(effectivenessPercent("nope", "deploy_regression")).toBeNull();
    expect(MITIGATION_EFFECTIVENESS.rollback.deploy_regression).toBe(1);
  });
});
