# Day/Night Cycle and Dynamic Office Visuals — Implementation Specification

**Document ID:** IZ-IMPL-05
**Classification:** Implementation Contract / Next-Phase Architecture Blueprint
**Status:** Approved for implementation — additive only, non-breaking, frontend-only (no backend or database changes)
**Integration baseline:** `frontend/src/components/layout/Topbar.tsx`, `frontend/src/components/office/IsometricOffice.tsx`, `frontend/src/components/office/isoMath.ts`, `frontend/src/components/office/WanderingEmployee.tsx`, `frontend/src/components/office/OfficeWorker.tsx`, `frontend/src/components/office/EmergencyFx.tsx`, `frontend/src/components/office/SkylineBackdrop.tsx`

---

## 1. System Objective

Layer an atmospheric day/night lighting progression and a real waypoint-graph movement system on top of the existing isometric office renderer, without altering the isometric projection math, the SVG viewBox contract, the zone-origin layout constants, or any backend telemetry field — this is a purely presentational specification. It formalizes and extends a clock convention that **already exists** in the codebase: `Topbar.tsx`'s `formatOfficeClock` function already treats `tick % 24` as an hour-of-day and `Math.floor(tick / 24) + 1` as a day counter (`Topbar.tsx:17-22`). This specification is the natural extension of that existing convention into the office's visual rendering, not a new clock model competing with it.

---

## 2. Day/Night System

### 2.1 Clock Mapping (Formalizing the Existing Convention)

$$
\text{HourOfDay}(tick) = tick \bmod 24
$$
$$
\text{DayNumber}(tick) = \left\lfloor \frac{tick}{24} \right\rfloor + 1
$$

This is byte-for-byte the same arithmetic already implemented in `Topbar.tsx:19-20`. No change to that function is required; it is reused as the single source of truth for "what hour is it," imported rather than reimplemented, by the new lighting system (§ 2.2) — avoiding the drift risk of two independently-maintained tick-to-hour formulas.

New shared utility, `frontend/src/utils/officeClock.ts`, extracting the existing inline arithmetic into an importable, testable function (an additive refactor — `Topbar.tsx` is updated to import and call it rather than recompute it inline, with its own external behavior completely unchanged):

```typescript
export function getHourOfDay(tick: number): number {
  return tick % 24;
}

export function getDayNumber(tick: number): number {
  return Math.floor(tick / 24) + 1;
}

export type DayPhase = "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "night";

// PHASE BOUNDARIES: DAWN (06:00), NOON (12:00), DUSK (18:00), NIGHT SHIFT (22:00-05:00)
export function getDayPhase(hour: number): DayPhase {
  if (hour >= 22 || hour < 5) return "night";
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 13) return "noon";
  if (hour >= 13 && hour < 18) return "afternoon";
  return "dusk"; // 18:00-22:00
}
```

`Topbar.tsx`'s existing `formatOfficeClock` is updated to call `getHourOfDay`/`getDayNumber` internally, changing zero characters of its own return value or external contract:

```typescript
function formatOfficeClock(tick: number, dayLabel: string): string {
  return `${dayLabel} ${getDayNumber(tick)} · ${getHourOfDay(tick).toString().padStart(2, "0")}:00`;
}
```

### 2.2 SVG Color Grading Filter

A new `<filter>` element, `officeDayNightGrade`, is added to `IsometricOffice.tsx`'s existing `<defs>` block (`IsometricOffice.tsx:88-93`, which currently contains only `groundShadowGradient`) — purely additive to that block:

```tsx
<defs>
  <radialGradient id="groundShadowGradient" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor="rgba(15,23,42,0.32)" />
    <stop offset="100%" stopColor="rgba(15,23,42,0)" />
  </radialGradient>

  {/* additive: day/night color grade, driven by CSS custom properties updated per-phase */}
  <filter id="officeDayNightGrade" x="-5%" y="-5%" width="110%" height="110%">
    <feColorMatrix type="matrix" values="var(--office-grade-matrix)" />
  </filter>
</defs>
```

Rather than re-deriving a 20-value color matrix in React state every render, the grading is driven by a CSS custom property (`--office-grade-matrix`) set once per phase transition on the root office `<div>` (`IsometricOffice.tsx:86`'s existing `ref={containerRef}` element), via a small `useEffect` keyed on the current `DayPhase`:

```typescript
const GRADE_MATRICES: Record<DayPhase, string> = {
  dawn:      "0.95 0.05 0.10 0 0.02   0.05 0.92 0.08 0 0.01   0.15 0.10 1.05 0 0.03   0 0 0 1 0",
  morning:   "1.00 0.00 0.00 0 0.00   0.00 1.00 0.00 0 0.00   0.00 0.00 1.00 0 0.00   0 0 0 1 0",
  noon:      "1.05 0.00 0.00 0 0.02   0.00 1.05 0.00 0 0.02   0.00 0.00 0.98 0 0.00   0 0 0 1 0",
  afternoon: "1.02 0.02 0.00 0 0.01   0.02 1.00 0.00 0 0.00   0.00 0.00 0.95 0 0.00   0 0 0 1 0",
  dusk:      "1.10 0.05 0.00 0 0.03   0.05 0.85 0.05 0 0.01   0.00 0.10 0.90 0 0.02   0 0 0 1 0",
  night:     "0.55 0.05 0.15 0 0.00   0.05 0.60 0.20 0 0.00   0.15 0.20 0.85 0 0.02   0 0 0 1 0",
};

useEffect(() => {
  containerRef.current?.style.setProperty("--office-grade-matrix", GRADE_MATRICES[dayPhase]);
}, [dayPhase]);
```

The filter is applied to the single top-level `<g>` wrapping the entire office scene (a new wrapping group added around the existing sequence of `<PerimeterWalls>`, `<ParquetFloor>`, room-tile, and prop components in `IsometricOffice.tsx`'s render body) via `filter="url(#officeDayNightGrade)"` — one additive wrapping element, with every existing child element passed through completely unmodified as children of that group. A CSS `transition: filter 4s linear` (or an SVG-native animated `feColorMatrix values` via `<animate>`, whichever the implementation phase prefers — both are additive, non-breaking choices) smooths phase boundaries rather than hard-cutting, consistent with the codebase's existing preference for eased transitions (`OfficeWorker.tsx`'s `transitionMs`-driven `ease-in-out` translate, `WanderingEmployee.tsx`'s `1800ms` walk transitions).

### 2.3 Night Mode Aesthetics

Three additive visual elements, each gated behind `dayPhase === "night"` (or, where a softer transition reads better, behind a `nightIntensity` continuous value derived from proximity to the 22:00/05:00 boundaries — an optional refinement, not required for correctness):

1. **Dimmed ceiling lights.** `PerimeterWalls.tsx` (Document 01 § Component Inventory) gains one additive conditional prop, `dimmed?: boolean`, passed as `dimmed={dayPhase === "night"}` from `IsometricOffice.tsx`. When `true`, any ambient overhead light rect/gradient already drawn by `PerimeterWalls` has its `opacity` reduced (e.g., from `1.0` to `0.35`) — a prop-driven opacity change requires no new SVG elements, only an additive optional prop threaded to an existing fill/opacity attribute.
2. **Monitor glow.** `OfficeWorker.tsx` already supports a `glowColor` prop rendering a soft ellipse behind the head (`OfficeWorker.tsx:144-146`, currently used for some existing desk contexts). Night mode sets `glowColor` to a cyan (`#22d3ee`) or emerald (`#34d399`) value (alternating per-desk, keyed by `desk index % 2`, for visual variety) on every seated engineer sprite rendered by `EngineerDesk.tsx`, wherever that component currently passes `glowColor` conditionally or not at all — an additive default value activated only under the night phase, not a new prop on `OfficeWorker` itself (the prop already exists).
3. **Illuminated skyline.** A new component, `frontend/src/components/office/SkylineBackdrop.tsx`, rendered as a fixed background layer behind the SVG canvas (a `position: absolute` `<div>` sibling preceding the existing `<svg>` element inside `IsometricOffice.tsx`'s root container, `IsometricOffice.tsx:86-87` — additive sibling, not a modification of the SVG itself), drawing a simple parallax skyline of building silhouettes as flat SVG rects/polygons. Under `dayPhase === "night"`, a subset of the buildings' "windows" (small rects scattered across each silhouette) render at full opacity with a warm/cool light fill, while under any daytime phase those same window rects render at near-zero opacity — achieved with the identical CSS-custom-property-driven approach as § 2.2 (`--skyline-window-opacity`), keeping the component's own render output static across phases and only its computed style dynamic, which avoids any SVG re-layout cost on every phase transition.

    **As-implemented (Phase 2 revision).** Three refinements landed on top of the base skyline: (a) window-pane fill was retuned from a flat, fully-opaque amber to a softer, per-cell-intensity-varied pair (`#fef08a` warm-white / `#7dd3fc` soft cyan, opacity cycling `0.55`–`0.91` via a deterministic hash of each pane's row/column) so the building faces no longer read as a wall of identical solid squares; (b) a dedicated deep-atmosphere background gradient (`#030712` at the top of the viewBox fading to `#0f172a` at the horizon) was added behind every building silhouette, rendered at full opacity during dusk/night and a faint 0.22-opacity vignette during the day so the pre-existing daylight CSS gradient (`.office-sky::before`, § 5 of Document `IZ-IMPL-09`) continues to show through; and (c) a ground-hugging horizon-haze band (`rgba(15,23,42,0.85)` fading to transparent) was added where the skyline silhouette meets the office floor, plus a small blinking red aviation-warning beacon (`animate-pulse`) atop each of the tallest ("near"-depth-band) towers' rooftop antennas — together giving the backdrop real atmospheric depth instead of a flat painted cutout.

None of these additions touch `isoMath.ts`'s `project()` function or any zone-origin constant (`SERVER_ROOM_ORIGIN`, `ENGINEERING_ORIGIN`, etc., `IsometricOffice.tsx:20-24`) — the isometric projection and room layout are completely orthogonal to, and untouched by, the lighting system.

### 2.4 Red Alert Emergency Override (As-Implemented, Phase 2)

A second, independent override state was added on top of the day/night grade described in § 2.2: whenever `redAlert` is true (a live `P1_CRITICAL` incident is present in `active_incidents`, or `status === "breached"`), the `officeDayNightGrade` filter's `feColorMatrix` values are substituted entirely with `RED_ALERT_GRADE_MATRIX`, superseding whatever `GRADE_MATRICES[dayPhase]` would otherwise apply for the current tick-derived hour. This matrix is deliberately not a tinted variant of the ambient grade; it is a heavy desaturation-and-darkening transform pushed toward a cool navy (diagonal coefficients roughly `0.30`–`0.44` per channel, blue retained slightly more than red/green, small cross-channel terms so shadow regions stay genuinely dark rather than color-cast), with the phase transition's usual 4-second `<animate>` duration shortened to 0.8 seconds so the alert state reads as an urgent, near-immediate cut rather than a slow fade.

This directly supersedes an earlier implementation that instead layered a flat, translucent brick-red overlay (`#7f1d1d` at `opacity: 0.22`) on top of the ordinary grade — that approach visually read as washing the whole office toward pink/salmon rather than an emergency blackout, and offered no way for the rack/character contrast to remain legible under the tint. The as-implemented design keeps the scene's blacks deep and the racks/desks contrasted against them, and reserves red exclusively for two purposes: (1) the rotating volumetric sweep and flashing dome of `EmergencyBeacon` (`frontend/src/components/office/EmergencyFx.tsx`), instanced at the server room, the engineering bay, and the boardroom whenever `redAlert` is true, and (2) each server rack's own existing status glow (spark/flame/floor-reflection treatment, unchanged from its baseline behavior). A companion `RedAlertOverlay` component renders one additional near-black (`#020617`, `opacity: 0.4`, pulsing) vignette path across the full floor footprint, functioning purely as a darkening device — not a color wash — consistent with the "spotlights cutting through darkness" model rather than the earlier flat tint.

---

## 3. Physical Waypoint & Movement Engine

### 3.1 Why This Builds on, Rather Than Replaces, `WanderingEmployee`

`WanderingEmployee.tsx` already implements the foundational primitive this specification needs: a component holding a `waypoints: Waypoint[]` array, an `index` state cycling through it on an interval, and rendering `OfficeWorker` at `current.x`/`current.y` with a CSS `transitionMs`-eased move (line count has since shifted with a bugfix, see note below — do not cite a specific line range without rereading the file). The gap this specification closes is that `WanderingEmployee`'s transition is a **direct straight-line CSS interpolation between two arbitrary points** — it does not check whether that straight line passes through a desk, a wall, or a server rack, because its existing waypoint pools (coffee machine, sofa, ping-pong table, per its docstring) were hand-authored to already avoid collisions. This specification generalizes that pattern into a real graph so that **new** waypoint pools (e.g., "any desk to the server room door") can be authored declaratively without a human manually verifying every pairwise straight line is collision-free.

> **Fixed (frontend hardening pass):** the interval effect described above originally listed the
> reactive `happiness` value in its dependency array. Because `user_happiness` drifts on almost
> every tick broadcast, the interval was torn down and recreated before `dwellMs` could ever
> elapse, so `index` effectively never advanced — every `WanderingEmployee` instance (both NPCs
> in `BreakRoom.tsx` and the corridor patroller in `IsometricOffice.tsx`) stood frozen at its
> first waypoint for the entire session, despite rendering a "patrolling" component. It now reads
> `happiness` via a ref inside the interval callback instead. This does not change anything this
> specification builds on top of (the waypoint-cycling shape, the CSS-eased move, the morale-gate
> skip logic) — only that the cycling itself now actually runs at the intended cadence.

### 3.2 Waypoint Graph Data Structure

New module, `frontend/src/components/office/waypointGraph.ts`:

```typescript
export interface GraphNode {
  id: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number; // euclidean tile distance, precomputed
}

export interface WaypointGraph {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
}

export function buildGraph(nodes: GraphNode[], edges: Array<[string, string]>): WaypointGraph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, GraphEdge[]>();
  for (const id of nodeMap.keys()) adjacency.set(id, []);
  for (const [fromId, toId] of edges) {
    const from = nodeMap.get(fromId)!;
    const to = nodeMap.get(toId)!;
    const weight = Math.hypot(to.x - from.x, to.y - from.y);
    adjacency.get(fromId)!.push({ from: fromId, to: toId, weight });
    adjacency.get(toId)!.push({ from: toId, to: fromId, weight }); // corridors are bidirectional
  }
  return { nodes: nodeMap, adjacency };
}
```

The graph's nodes are authored as explicit corridor waypoints along the office's existing `WalkwayGuide` lines (`IsometricOffice.tsx:106-107`, already drawn as the two main hallway circulation guides at `axis="y" fixed={8.6}` and `axis="x" fixed={8.4}`) and doorway gaps (the existing `GlassWall` `doorFrom`/`doorTo` props, `IsometricOffice.tsx:110, 114`), rather than being freely placed — this guarantees every graph edge, by construction, follows a path the office's own architecture already declares as walkable, with zero risk of a new edge silently cutting through a wall segment that a human author would need to visually double-check.

```typescript
export const OFFICE_WAYPOINT_NODES: GraphNode[] = [
  { id: "engineering-hall-1", x: 10.5, y: 8.4 },
  { id: "engineering-hall-2", x: 13.0, y: 8.4 },
  { id: "central-junction", x: 8.6, y: 8.4 },
  { id: "server-room-door", x: 2.3, y: 8.6 },
  { id: "server-room-interior", x: 3.0, y: 2.0 },
  { id: "breakroom-junction", x: 8.6, y: 9.5 },
  { id: "breakroom-coffee-machine", x: 9.5, y: 10.2 },
  { id: "boardroom-door", x: 8.6, y: 10.95 },
  { id: "reception-junction", x: 13.5, y: 8.4 },
];

export const OFFICE_WAYPOINT_EDGES: Array<[string, string]> = [
  ["engineering-hall-1", "engineering-hall-2"],
  ["engineering-hall-1", "central-junction"],
  ["central-junction", "server-room-door"],
  ["server-room-door", "server-room-interior"],
  ["central-junction", "breakroom-junction"],
  ["breakroom-junction", "breakroom-coffee-machine"],
  ["breakroom-junction", "boardroom-door"],
  ["central-junction", "reception-junction"],
];

export const OFFICE_GRAPH = buildGraph(OFFICE_WAYPOINT_NODES, OFFICE_WAYPOINT_EDGES);
```

Each engineer desk position (rendered by `EngineerDesk.tsx` at some `(x, y)` per the existing engineering-bay layout) is additionally registered as a leaf node connected to its nearest `engineering-hall-*` junction — generated programmatically at desk-layout time (`nearestHallNode(deskX, deskY)`, a simple minimum-distance scan over the fixed hall-junction nodes) rather than hand-authored per desk, so adding or repositioning a desk in `EngineeringFloor.tsx` automatically yields a correctly-connected graph leaf with no waypoint-authoring step required.

### 3.3 Pathfinding — A* Over the Graph

```typescript
export function findPath(graph: WaypointGraph, startId: string, goalId: string): GraphNode[] {
  const heuristic = (a: GraphNode, b: GraphNode) => Math.hypot(b.x - a.x, b.y - a.y);
  const openSet = new Set([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, heuristic(graph.nodes.get(startId)!, graph.nodes.get(goalId)!)]]);

  while (openSet.size > 0) {
    const current = [...openSet].reduce((best, id) =>
      (fScore.get(id) ?? Infinity) < (fScore.get(best) ?? Infinity) ? id : best
    );
    if (current === goalId) {
      const path: GraphNode[] = [graph.nodes.get(current)!];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.unshift(graph.nodes.get(cursor)!);
      }
      return path;
    }
    openSet.delete(current);
    for (const edge of graph.adjacency.get(current) ?? []) {
      const tentativeG = (gScore.get(current) ?? Infinity) + edge.weight;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentativeG);
        fScore.set(edge.to, tentativeG + heuristic(graph.nodes.get(edge.to)!, graph.nodes.get(goalId)!));
        openSet.add(edge.to);
      }
    }
  }
  return []; // no path found — caller falls back to a direct teleport, logged as a graph-authoring gap, never silently
}
```

A standard, textbook A* implementation over the small (≤ ~15 node) fixed graph from § 3.2 — at this scale the algorithm's `O(n²)`-per-step naive open-set scan (rather than a binary-heap priority queue) is a deliberate simplicity-over-micro-optimization choice, since the entire graph is smaller than the constant factor a heap would need to pay off, consistent with the codebase's general preference for straightforward, readable implementations over premature optimization (e.g., `formulas.py`'s plain-loop `find_mitigation` lookup rather than a dict-indexed catalog, Document 04 § 1).

### 3.4 Movement Component — `PathfindingEmployee`

New component, `frontend/src/components/office/PathfindingEmployee.tsx`, a sibling to (not a replacement for) `WanderingEmployee.tsx`. Where `WanderingEmployee` cycles a fixed, pre-vetted waypoint loop with instantaneous re-targeting, `PathfindingEmployee` computes a multi-hop path via `findPath` whenever its `targetNodeId` prop changes, then walks that path's nodes **in sequence**, one CSS-eased transition per hop (reusing `OfficeWorker`'s existing `transitionMs` prop exactly as `WanderingEmployee` already does), rather than one long transition straight to the final destination:

```typescript
interface PathfindingEmployeeProps {
  currentNodeId: string;
  targetNodeId: string;
  shirtColor: string;
  hairColor: string;
  hopDurationMs?: number;
  onArrived?: () => void;
}

export default function PathfindingEmployee({
  currentNodeId, targetNodeId, shirtColor, hairColor, hopDurationMs = 900, onArrived,
}: PathfindingEmployeeProps) {
  const [path, setPath] = useState<GraphNode[]>([]);
  const [hopIndex, setHopIndex] = useState(0);

  useEffect(() => {
    setPath(findPath(OFFICE_GRAPH, currentNodeId, targetNodeId));
    setHopIndex(0);
  }, [currentNodeId, targetNodeId]);

  useEffect(() => {
    if (hopIndex >= path.length - 1) {
      if (path.length > 0) onArrived?.();
      return;
    }
    const timer = setTimeout(() => setHopIndex((i) => i + 1), hopDurationMs);
    return () => clearTimeout(timer);
  }, [hopIndex, path, hopDurationMs, onArrived]);

  const node = path[hopIndex] ?? OFFICE_GRAPH.nodes.get(currentNodeId)!;
  const mood: WorkerMood = "running";

  return (
    <OfficeWorker x={node.x} y={node.y} shirtColor={shirtColor} hairColor={hairColor} mood={mood} transitionMs={hopDurationMs} />
  );
}
```

This directly satisfies the "engineers walk along valid office corridors instead of teleporting or clipping through desks" requirement: because every edge in `OFFICE_GRAPH` was authored along an already-walkable architectural feature (§ 3.2), and the component transitions hop-by-hop along the returned path rather than in one straight CSS interpolation from origin to final destination, the rendered motion is visually constrained to the corridor network by construction.

`PathfindingEmployee` is the component the Staff On-Call system's "running between desks and server room" sprite state (`03_STAFF_ONCALL_AND_FATIGUE_SPEC.md` § 4.1) is intended to use once an engineer's `assigned_service_id` incident goes active — the engineer's current desk node becomes `currentNodeId` and `server-room-door`/`server-room-interior` becomes `targetNodeId`, with `onArrived` transitioning the sprite's mood away from `"running"` once the walk completes.

---

## 4. Non-Breaking Compliance Checklist

- [x] `isoMath.ts`'s `project()` function and every zone-origin constant in `IsometricOffice.tsx` are read-only inputs to this specification; none are modified.
- [x] `Topbar.tsx`'s `formatOfficeClock` external output is unchanged; its internal arithmetic is extracted into a shared, additive utility module.
- [x] The color-grading filter wraps existing scene content in one additive `<g>`; no existing child element, prop, or z-order is altered.
- [x] `PerimeterWalls.tsx` gains one additive optional prop (`dimmed`) defaulting to falsy/absent behavior identical to the current render.
- [x] `OfficeWorker.tsx`'s existing `glowColor` prop is reused, not extended or renamed; night-mode glow is a caller-side default, not a component change.
- [x] `SkylineBackdrop.tsx` is a wholly new sibling component; it does not alter the existing `<svg>` element's viewBox, content, or event handlers.
- [x] `WanderingEmployee.tsx` is completely untouched — `PathfindingEmployee.tsx` is a new, separate component for the new corridor-constrained use case, preserving every existing NPC patrol behavior verbatim.
- [x] This specification introduces no new backend endpoint, database table, or `TICK_BROADCAST` field — it is entirely client-side and has no server-side integration surface.
- [x] The § 2.4 red-alert grade override reads `active_incidents` and `status`, both pre-existing `TICK_BROADCAST` fields, and introduces no new server-side state; it substitutes the `feColorMatrix` values applied by the pre-existing `officeDayNightGrade` filter rather than adding a second filter element.
- [x] `EmergencyBeacon` (`EmergencyFx.tsx`) and `RedAlertOverlay` are additive components with no effect on `isoMath.ts`, zone-origin constants, or any existing prop/child of `IsometricOffice.tsx`'s render tree beyond their own conditionally-rendered subtree.
