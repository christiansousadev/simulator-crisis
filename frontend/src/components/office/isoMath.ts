// isometric projection helpers: convert grid-space (x, y, z) into flat 2d screen points.
// x and y are tile units scaled by the tile dimensions; z is a height in tile units too,
// scaled separately by Z_SCALE so a wall or a person actually reads as "tall" on screen.

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const Z_SCALE = 56;

export interface Point {
  x: number;
  y: number;
}

// PROJECT A GRID COORDINATE INTO SCREEN SPACE
export function project(x: number, y: number, z = 0): Point {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2) - z * Z_SCALE,
  };
}

function toPath(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export interface BoxFaces {
  top: string;
  faceRight: string;
  faceLeft: string;
}

// BUILD ONE FACE AS AN 8-POINT POLYGON WITH SMALL CUT (CHAMFERED) CORNERS INSTEAD OF A PLAIN
// 4-POINT RECTANGLE -- SVG polygons can't take a border-radius, so a chamfer is the cheapest way
// to soften an isometric box's silhouette without switching every face to a curved <path>.
// `getPoint(a, b)` maps a corner in the face's own 2D local space to a projected screen Point;
// `spanA`/`spanB` are that local space's two extents (in grid units, before projection).
function chamferedFace(getPoint: (a: number, b: number) => Point, spanA: number, spanB: number): string {
  // proportional on small props, capped so a large object (a wall-height rack, a wide desk)
  // doesn't get an oversized cut corner -- and clamped below half the shorter span so two
  // opposite cuts can never cross on a sliver-thin face (e.g. the ping-pong net, w=0.04)
  const c = Math.min(0.05, (Math.min(spanA, spanB) / 2) * 0.4);
  if (c <= 0.002) {
    // too thin to bevel meaningfully -- fall back to the plain rectangle
    return toPath([getPoint(0, 0), getPoint(spanA, 0), getPoint(spanA, spanB), getPoint(0, spanB)]);
  }
  return toPath([
    getPoint(c, 0),
    getPoint(spanA - c, 0),
    getPoint(spanA, c),
    getPoint(spanA, spanB - c),
    getPoint(spanA - c, spanB),
    getPoint(c, spanB),
    getPoint(0, spanB - c),
    getPoint(0, c),
  ]);
}

// BUILD THE THREE VISIBLE SVG POLYGONS OF AN ISOMETRIC BOX
// x, y: grid origin (near corner is at x+w, y+d); z: base height; w, d, h: size in grid units
export function boxFaces(x: number, y: number, z: number, w: number, d: number, h: number): BoxFaces {
  const p = (dx: number, dy: number, dz: number) => project(x + dx, y + dy, z + dz);
  return {
    top: chamferedFace((dx, dy) => p(dx, dy, h), w, d),
    // face at max y, facing the screen lower-right
    faceRight: chamferedFace((dx, dz) => p(dx, d, dz), w, h),
    // face at max x, facing the screen lower-left
    faceLeft: chamferedFace((dy, dz) => p(w, dy, dz), d, h),
  };
}

// SORT KEY FOR PAINTER'S ALGORITHM: objects further along x+y (closer to viewer) draw last
export function depthOf(x: number, y: number): number {
  return x + y;
}

// shade() is called three times per IsoBox and the scene has thousands of boxes; the palette is
// tiny, so every distinct (hex, factor) pair is computed once
const shadeCache = new Map<string, string>();

// DARKEN OR LIGHTEN A HEX COLOR BY A MULTIPLICATIVE FACTOR, USED FOR ISOMETRIC FACE SHADING
export function shade(hex: string, factor: number): string {
  const key = `${hex}|${factor}`;
  const hit = shadeCache.get(key);
  if (hit !== undefined) return hit;
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  const out = `rgb(${r}, ${g}, ${b})`;
  shadeCache.set(key, out);
  return out;
}
