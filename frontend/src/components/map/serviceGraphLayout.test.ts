import { describe, expect, it } from "vitest";
import { layoutServiceGraph } from "./serviceGraphLayout";

const svc = (id: string, dependencies: string[] = []) => ({ id, dependencies });

describe("layoutServiceGraph", () => {
  it("puts a service one layer right of its deepest dependency", () => {
    const { nodes, edges } = layoutServiceGraph([svc("a"), svc("b", ["a"]), svc("c", ["a", "b"])]);
    const layer = (id: string) => nodes.find((n) => n.id === id)?.layer;
    expect([layer("a"), layer("b"), layer("c")]).toEqual([0, 1, 2]);
    expect(edges).toContainEqual({ from: "b", to: "c" });
  });

  it("stacks services of the same layer without overlapping", () => {
    const { nodes } = layoutServiceGraph([svc("a"), svc("b", ["a"]), svc("c", ["a"])]);
    const [b, c] = ["b", "c"].map((id) => nodes.find((n) => n.id === id)!);
    expect(Math.abs(b.y - c.y)).toBeGreaterThan(84);
  });

  it("survives cycles and unknown dependencies", () => {
    const { nodes, edges } = layoutServiceGraph([svc("a", ["b"]), svc("b", ["a"]), svc("c", ["ghost", "c"])]);
    expect(nodes).toHaveLength(3);
    expect(edges.every((e) => e.from !== "ghost" && e.from !== e.to)).toBe(true);
  });

  it("centres a single column", () => {
    const { nodes } = layoutServiceGraph([svc("a"), svc("b")]);
    expect(nodes[0].x).toBe(nodes[1].x);
  });
});
