import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CreditCounter from "./CreditCounter";

describe("CreditCounter", () => {
  it("renders the exact balance as one text node-set (no abbreviation, single element)", () => {
    render(<CreditCounter budget={212450} />);
    expect(screen.getAllByText(`$${(212450).toLocaleString()}`)).toHaveLength(1);
  });

  it("carries the tutorial spotlight hook and the kpi id", () => {
    const { container } = render(<CreditCounter budget={5000} />);
    expect(container.querySelector('[data-tour="cash-counter"][data-kpi="budget"]')).not.toBeNull();
  });
});
