import { create } from "zustand";
import { WalkerBand, WalkerPlace, bandOf } from "./rosterPlan";
import { GraphNode, NODE, OFFICE_GRAPH, WaypointGraph, facingForMove, findPath, hopDurationMs } from "./waypointGraph";

// the moving part of the roster: one WalkerView per hired engineer, advanced hop by hop along the
// waypoint graph by plain JS timers (so it keeps walking while the simulation is paused). React only
// renders the views; it never drives them.

export interface WalkerView {
  id: string;
  // the node this sprite is at, or walking towards
  nodeId: string;
  x: number;
  y: number;
  z: number;
  // duration of the css transition into (x, y, z); 0 = appear there without sliding
  hopMs: number;
  facing: "left" | "right";
  seated: boolean;
  // which painter layer renders the sprite (see bandOf)
  band: WalkerBand;
  place: WalkerPlace | "entering";
  mug: boolean;
}

export interface WalkerTarget {
  id: string;
  nodeId: string;
  place: WalkerPlace;
  mug: boolean;
  // a brand-new hire walks in through reception; anyone else already on the books just stands at the target
  fresh: boolean;
}

interface Step {
  node: GraphNode;
  pauseMs: number;
  onReach?: () => void;
}

interface Runtime {
  view: WalkerView;
  targetNodeId: string;
  queue: Step[];
  timer: ReturnType<typeof setTimeout> | null;
  // wall-clock time the sprite's current hop finishes, so a re-plan never cuts a hop in half
  busyUntil: number;
}

// a short beat at the reception desk, and the gap between a layer handoff and the next hop
export const CHECK_IN_PAUSE_MS = 1100;
export const HANDOFF_MS = 90;
// a freshly mounted sprite needs a painted frame at its start spot before its first hop can slide
const FIRST_HOP_DELAY_MS = 160;

interface StageState {
  walkers: WalkerView[];
  // the vault door opens while somebody is inside it
  serverRoomOccupied: boolean;
  // bumps every time a new hire reaches the reception desk
  checkIns: number;
}

export const useRosterStage = create<StageState>(() => ({ walkers: [], serverRoomOccupied: false, checkIns: 0 }));

const SERVER_NODES = new Set<string>([NODE.serverRoomDoor, NODE.serverRoomFront]);
const isServerNode = (id: string) => SERVER_NODES.has(id) || id.startsWith("rack-front-");

interface StageSink {
  publish: (walkers: WalkerView[], serverRoomOccupied: boolean) => void;
  checkIn: () => void;
}

const defaultSink: StageSink = {
  publish: (walkers, serverRoomOccupied) => useRosterStage.setState({ walkers, serverRoomOccupied }),
  checkIn: () => useRosterStage.setState((s) => ({ checkIns: s.checkIns + 1 })),
};

export class RosterChoreographer {
  private runtimes = new Map<string, Runtime>();

  constructor(
    private readonly graph: WaypointGraph = OFFICE_GRAPH,
    private readonly sink: StageSink = defaultSink
  ) {}

  // BRING THE STAGE IN LINE WITH THE PLANNED TARGETS. `instant` (reduced motion) teleports instead of walking
  sync(targets: readonly WalkerTarget[], opts: { instant: boolean }): void {
    const wanted = new Set(targets.map((t) => t.id));
    for (const [id, rt] of this.runtimes) {
      if (wanted.has(id)) continue;
      if (rt.timer) clearTimeout(rt.timer);
      this.runtimes.delete(id);
    }

    for (const target of targets) {
      const node = this.graph.nodes.get(target.nodeId);
      if (!node) continue;
      const existing = this.runtimes.get(target.id);

      if (!existing) {
        const entering = target.fresh && !opts.instant && this.graph.nodes.has(NODE.entrance);
        const startNode = entering ? this.graph.nodes.get(NODE.entrance)! : node;
        const rt: Runtime = {
          view: this.viewAt(target, startNode, entering ? "entering" : target.place),
          targetNodeId: target.nodeId,
          queue: [],
          timer: null,
          busyUntil: 0,
        };
        this.runtimes.set(target.id, rt);
        if (entering) this.planRoute(rt, target, { viaReception: true, startDelayMs: FIRST_HOP_DELAY_MS });
        continue;
      }

      const mugChanged = existing.view.mug !== target.mug;
      if (existing.targetNodeId === target.nodeId) {
        if (mugChanged || existing.view.place !== target.place) {
          existing.view = { ...existing.view, mug: target.mug, place: existing.queue.length ? existing.view.place : target.place };
        }
        continue;
      }
      existing.targetNodeId = target.nodeId;
      if (opts.instant) {
        if (existing.timer) clearTimeout(existing.timer);
        existing.timer = null;
        existing.queue = [];
        existing.view = this.viewAt(target, node, target.place);
        continue;
      }
      this.planRoute(existing, target, { viaReception: false, startDelayMs: 0 });
    }
    this.publishAll();
  }

  dispose(): void {
    for (const rt of this.runtimes.values()) if (rt.timer) clearTimeout(rt.timer);
    this.runtimes.clear();
    this.sink.publish([], false);
  }

  private viewAt(target: WalkerTarget, node: GraphNode, place: WalkerView["place"]): WalkerView {
    return {
      id: target.id,
      nodeId: node.id,
      x: node.x,
      y: node.y,
      z: node.z ?? 0,
      hopMs: 0,
      facing: node.face ?? "right",
      seated: Boolean(node.seat) && place !== "entering",
      band: bandOf(node.x, node.y),
      place,
      mug: target.mug,
    };
  }

  // BUILD THE STEP QUEUE FROM THE SPRITE'S CURRENT NODE TO ITS TARGET (OPTIONALLY CHECKING IN FIRST)
  private planRoute(rt: Runtime, target: WalkerTarget, opts: { viaReception: boolean; startDelayMs: number }): void {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = null;

    const legs: GraphNode[][] = [];
    const checkInAt = opts.viaReception ? this.graph.nodes.get(NODE.receptionFront) : undefined;
    let from = rt.view.nodeId;
    if (checkInAt) {
      legs.push(findPath(this.graph, from, checkInAt.id));
      from = checkInAt.id;
    }
    legs.push(findPath(this.graph, from, target.nodeId));

    // a broken graph must never strand a sprite: teleport to the target instead of walking nowhere
    if (legs.some((leg) => leg.length === 0)) {
      const node = this.graph.nodes.get(target.nodeId)!;
      rt.queue = [];
      rt.view = this.viewAt(target, node, target.place);
      return;
    }

    const steps: Step[] = [];
    legs.forEach((leg, legIndex) => {
      // the first node of every leg is where the sprite already stands
      leg.slice(1).forEach((node, i, rest) => {
        const isCheckIn = checkInAt !== undefined && legIndex === 0 && i === rest.length - 1;
        steps.push({
          node,
          pauseMs: isCheckIn ? CHECK_IN_PAUSE_MS : 0,
          onReach: isCheckIn ? () => this.sink.checkIn() : undefined,
        });
      });
    });

    rt.queue = steps;
    rt.view = { ...rt.view, place: opts.viaReception ? "entering" : rt.view.place, mug: target.mug };
    const delay = Math.max(opts.startDelayMs, rt.busyUntil - Date.now());
    rt.timer = setTimeout(() => this.advance(rt, target), delay);
  }

  // BEFORE EACH HOP: IF IT CROSSES INTO ANOTHER PAINTER LAYER, SWAP LAYERS FIRST WHILE THE SPRITE STANDS STILL
  private advance(rt: Runtime, target: WalkerTarget): void {
    rt.timer = null;
    const next = rt.queue[0];
    if (!next) {
      this.settle(rt, target.place);
      this.publishAll();
      return;
    }
    const band = bandOf(next.node.x, next.node.y);
    if (band !== rt.view.band) {
      rt.view = { ...rt.view, band, hopMs: 0 };
      this.publishAll();
      rt.timer = setTimeout(() => this.hop(rt, target), HANDOFF_MS);
      return;
    }
    this.hop(rt, target);
  }

  private hop(rt: Runtime, target: WalkerTarget): void {
    rt.timer = null;
    const step = rt.queue.shift();
    if (!step) {
      this.settle(rt, target.place);
      this.publishAll();
      return;
    }
    const from = rt.view;
    const hopMs = hopDurationMs(from, step.node);
    rt.view = {
      ...from,
      nodeId: step.node.id,
      x: step.node.x,
      y: step.node.y,
      z: step.node.z ?? 0,
      hopMs,
      facing: facingForMove(from, step.node, from.facing),
      seated: false,
      band: bandOf(step.node.x, step.node.y),
    };
    rt.busyUntil = Date.now() + hopMs;
    this.publishAll();

    rt.timer = setTimeout(() => {
      rt.timer = null;
      step.onReach?.();
      if (rt.queue.length === 0) {
        this.settle(rt, target.place);
        this.publishAll();
        return;
      }
      if (step.pauseMs > 0) {
        rt.timer = setTimeout(() => this.advance(rt, target), step.pauseMs);
        return;
      }
      this.advance(rt, target);
    }, hopMs);
  }

  // ARRIVED: SIT DOWN OR STAND, AND TURN TO FACE WHATEVER THE SPOT IS FOR
  private settle(rt: Runtime, place: WalkerPlace): void {
    const node = this.graph.nodes.get(rt.targetNodeId);
    rt.view = {
      ...rt.view,
      seated: Boolean(node?.seat),
      facing: node?.face ?? rt.view.facing,
      place,
    };
  }

  private publishAll(): void {
    const views = [...this.runtimes.values()].map((rt) => rt.view);
    this.sink.publish(views, views.some((v) => isServerNode(v.nodeId)));
  }
}

// the app-wide stage, driven by RosterDirector
export const rosterChoreographer = new RosterChoreographer();
