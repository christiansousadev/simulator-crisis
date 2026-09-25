import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReputationMeter from "./ReputationMeter";

describe("ReputationMeter", () => {
  it("renders the rounded reputation score", () => {
    render(<ReputationMeter reputation={67.8} />);
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("clamps the filled bar width to 100% even if reputation somehow exceeds it", () => {
    const { container } = render(<ReputationMeter reputation={140} />);
    const fill = container.querySelector("div[style]") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("never renders a negative bar width for a below-zero value", () => {
    const { container } = render(<ReputationMeter reputation={-20} />);
    const fill = container.querySelector("div[style]") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});
