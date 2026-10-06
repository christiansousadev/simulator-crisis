// shared world-space layout facts for the office scene (grid units, same space as isoMath.project).
// the zone origins mirror the constants in IsometricOffice.tsx -- they are copied here, not imported,
// so the roster/pathfinding code stays independent of the scene component. keep them in sync.

export interface GridPoint {
  x: number;
  y: number;
}

export const SERVER_ROOM_ORIGIN: GridPoint = { x: 0.5, y: 0.5 };
export const ENGINEERING_ORIGIN: GridPoint = { x: 9.9, y: 0.5 };
export const BOARDROOM_ORIGIN: GridPoint = { x: 0.5, y: 9.0 };
export const BREAKROOM_ORIGIN: GridPoint = { x: 8.2, y: 9.0 };
export const RECEPTION_ORIGIN: GridPoint = { x: 17.0, y: 11.2 };

// the vault's sliding glass door sits at this offset from the server room origin (ServerRoom.tsx)
export const SERVER_DOOR_OFFSET: GridPoint = { x: 3.4, y: 3.55 };
export const SERVER_ROOM_DOOR: GridPoint = {
  x: SERVER_ROOM_ORIGIN.x + SERVER_DOOR_OFFSET.x,
  y: SERVER_ROOM_ORIGIN.y + SERVER_DOOR_OFFSET.y,
};

// racks stand in one row; this mirrors ServerRoom's rackGridPosition (x = origin + 0.8 + i * spacing)
export const RACK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"] as const;
export const RACK_SPACING = 1.3;
export const RACK_SIZE = 0.55;

export function rackOrigin(index: number): GridPoint {
  return { x: SERVER_ROOM_ORIGIN.x + 0.8 + index * RACK_SPACING, y: SERVER_ROOM_ORIGIN.y + 2.0 };
}

// engineering bay desks: two rows of assigned desks plus a third row of reserve desks. the slots are
// relative to ENGINEERING_ORIGIN, same numbers EngineeringFloor draws with
export const DESK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"] as const;
export const DESK_SLOTS: GridPoint[] = [
  { x: 0, y: 0 },
  { x: 2.5, y: 0 },
  { x: 5.0, y: 0 },
  { x: 1.2, y: 2.6 },
  { x: 3.7, y: 2.6 },
];
export const RESERVE_SLOTS: GridPoint[] = [
  { x: 0, y: 5.1 },
  { x: 2.5, y: 5.1 },
  { x: 5.0, y: 5.1 },
];

// the seated sprite sits on the chair just in front of the desk surface
export const SEAT_OFFSET: GridPoint = { x: 0.5, y: 0.72 };
export const SEAT_Z = 0.24;

export function deskOrigin(slot: GridPoint): GridPoint {
  return { x: ENGINEERING_ORIGIN.x + slot.x, y: ENGINEERING_ORIGIN.y + slot.y };
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label: string;
}

function box(label: string, x: number, y: number, w: number, d: number): Rect {
  return { label, x0: x, y0: y, x1: x + w, y1: y + d };
}

// furniture footprints a walking sprite must never cross. used by the graph tests as a clearance
// check; chairs, sofas and armchairs are deliberately absent -- sprites sit on those
export function walkBlockers(): Rect[] {
  const rects: Rect[] = [];
  [...DESK_SLOTS, ...RESERVE_SLOTS].forEach((slot, i) => {
    const o = deskOrigin(slot);
    rects.push(box(`desk-${i}`, o.x, o.y, 1.0, 0.55));
    rects.push(box(`desk-return-${i}`, o.x + 0.82, o.y + 0.55, 0.32, 0.42));
  });
  RACK_ORDER.forEach((id, i) => {
    const o = rackOrigin(i);
    rects.push(box(`rack-${id}`, o.x, o.y, RACK_SIZE, RACK_SIZE));
  });
  const b = BREAKROOM_ORIGIN;
  rects.push(box("pingpong", b.x + 0.3, b.y + 0.3, 1.1, 0.6));
  rects.push(box("water-cooler", b.x + 1.7, b.y + 0.25, 0.24, 0.24));
  rects.push(box("kitchen-counter", b.x + 2.05, b.y + 0.2, 0.9, 0.3));
  rects.push(box("fridge", b.x + 2.75, b.y + 0.85, 0.42, 0.4));
  const r = RECEPTION_ORIGIN;
  rects.push(box("reception-desk", r.x, r.y, 1.5, 0.75));
  rects.push(box("logo-wall", r.x + 0.1, r.y - 0.38, 1.1, 0.07));
  rects.push(box("turnstile", r.x - 1.8, r.y + 0.35, 0.55, 0.28));
  rects.push(box("lobby-cooler", r.x + 1.9, r.y + 0.6, 0.24, 0.24));
  rects.push(box("lobby-armchair-a", r.x + 2.6, r.y + 0.4, 0.4, 0.4));
  rects.push(box("lobby-armchair-b", r.x + 2.6, r.y + 1.4, 0.4, 0.4));
  rects.push(box("lobby-table", r.x + 2.95, r.y + 0.85, 0.5, 0.4));
  rects.push(box("meeting-nook", 16.35, 9.4, 1.0, 0.6));
  // loose plants and bins scattered across the floor (IsometricOffice.tsx density props)
  for (const [px, py] of [
    [9.0, 5.0],
    [0.3, 4.4],
    [7.3, 9.4],
    [2.0, 6.5],
    [19.5, 6.5],
    [20.5, 3.5],
    [r.x - 0.6, r.y + 1.5],
    [r.x + 2.3, r.y + 1.9],
  ]) {
    rects.push(box("plant", px, py, 0.3, 0.3));
  }
  rects.push(box("bin", 5.6, 4.6, 0.2, 0.2));
  rects.push(box("bin", 17.0, 5.5, 0.2, 0.2));
  // glass divider between the server vault corridor and the engineering bay, minus its doorway
  rects.push({ label: "bay-glass-north", x0: 9.15, y0: 0.4, x1: 9.25, y1: 1.7 });
  rects.push({ label: "bay-glass-south", x0: 9.15, y0: 2.9, x1: 9.25, y1: 4.2 });
  return rects;
}

// where the next placed infrastructure node lands: a shelf in front of the racks, four per row
// (mirrors the placement maths in IsometricOffice's handleServiceSelect)
export function infrastructureSlot(existingCount: number): GridPoint {
  return {
    x: SERVER_ROOM_ORIGIN.x + 0.5 + (existingCount % 4) * 1.0,
    y: SERVER_ROOM_ORIGIN.y + 3.3 + Math.floor(existingCount / 4) * 0.6,
  };
}
