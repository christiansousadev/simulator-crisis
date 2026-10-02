import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LiveSparkline from "./LiveSparkline";

describe("LiveSparkline", () => {
  it("renders null when data array is empty", () => {
    const { container } = render(<LiveSparkline data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders svg polyline when data is provided", () => {
    const { container } = render(<LiveSparkline data={[10, 20, 15, 30]} tone="emerald" />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline?.getAttribute("points")).toContain(",");
  });

  it("renders pulsed marker on the latest data point", () => {
    const { container } = render(<LiveSparkline data={[50, 60, 70]} tone="rose" />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });
});
