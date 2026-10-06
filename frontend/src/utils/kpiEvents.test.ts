import { describe, expect, it } from "vitest";
import { formatKpiChip, kpiEventIsGood, KpiEvent, KPI_MERGE_WINDOW_MS, mergeKpiEvent } from "./kpiEvents";

let seq = 0;
const makeId = () => `k-${seq++}`;

describe("mergeKpiEvent", () => {
  it("starts a new chip for the first change of a kpi", () => {
    const out = mergeKpiEvent([], { kpi: "budget", amount: -1800, label: "Rollback" }, 1000, makeId);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kpi: "budget", amount: -1800, label: "Rollback", count: 1, rev: 0 });
  });

  it("merges quick changes to the same kpi into one chip", () => {
    let list: KpiEvent[] = [];
    list = mergeKpiEvent(list, { kpi: "budget", amount: -1800, label: "Rollback" }, 1000, makeId);
    list = mergeKpiEvent(list, { kpi: "budget", amount: -800, label: "Circuit Breaker" }, 1300, makeId);
    list = mergeKpiEvent(list, { kpi: "budget", amount: -500, label: "Hotfix" }, 1600, makeId);
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(-3100);
    expect(list[0].count).toBe(3);
    expect(list[0].rev).toBe(2);
    // the biggest contribution names the chip
    expect(list[0].label).toBe("Rollback");
  });

  it("keeps different kpis in separate chips", () => {
    let list: KpiEvent[] = [];
    list = mergeKpiEvent(list, { kpi: "budget", amount: -100 }, 0, makeId);
    list = mergeKpiEvent(list, { kpi: "techDebt", amount: 3 }, 10, makeId);
    expect(list.map((e) => e.kpi)).toEqual(["budget", "techDebt"]);
  });

  it("starts a fresh chip once the merge window has passed", () => {
    let list: KpiEvent[] = [];
    list = mergeKpiEvent(list, { kpi: "budget", amount: -100 }, 0, makeId);
    list = mergeKpiEvent(list, { kpi: "budget", amount: -100 }, KPI_MERGE_WINDOW_MS + 1, makeId);
    expect(list).toHaveLength(2);
  });

  it("drops a chip when merged changes cancel out, and ignores zero/NaN amounts", () => {
    let list: KpiEvent[] = [];
    list = mergeKpiEvent(list, { kpi: "morale", amount: 4 }, 0, makeId);
    list = mergeKpiEvent(list, { kpi: "morale", amount: -4 }, 100, makeId);
    expect(list).toHaveLength(0);
    expect(mergeKpiEvent([], { kpi: "morale", amount: 0 }, 0, makeId)).toHaveLength(0);
    expect(mergeKpiEvent([], { kpi: "morale", amount: NaN }, 0, makeId)).toHaveLength(0);
  });
});

describe("formatKpiChip", () => {
  it("formats cash with a real minus, cause and merge count", () => {
    expect(formatKpiChip({ kpi: "budget", amount: -1800, label: "Rollback", count: 1 })).toBe(`−$${(1800).toLocaleString()} · Rollback`);
    expect(formatKpiChip({ kpi: "techDebt", amount: 2, label: "", count: 3 })).toBe("+2 TDI ×3");
  });

  it("treats a falling tech debt as good news and a falling budget as bad", () => {
    expect(kpiEventIsGood("techDebt", -2)).toBe(true);
    expect(kpiEventIsGood("budget", -2)).toBe(false);
    expect(kpiEventIsGood("reputation", 3)).toBe(true);
  });
});
