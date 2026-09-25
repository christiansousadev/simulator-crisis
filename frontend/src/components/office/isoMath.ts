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

// BUILD THE THREE VISIBLE SVG POLYGONS OF AN ISOMETRIC BOX
// x, y: grid origin (near corner is at x+w, y+d); z: base height; w, d, h: size in grid units
export function boxFaces(x: number, y: number, z: number, w: number, d: number, h: number): BoxFaces {
  const p = (dx: number, dy: number, dz: number) => project(x + dx, y + dy, z + dz);
  return {
    top: toPath([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)]),
    // face at max y, facing the screen lower-right
    faceRight: toPath([p(0, d, 0), p(w, d, 0), p(w, d, h), p(0, d, h)]),
    // face at max x, facing the screen lower-left
    faceLeft: toPath([p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, 0, h)]),
  };
}

// SORT KEY FOR PAINTER'S ALGORITHM: objects further along x+y (closer to viewer) draw last
export function depthOf(x: number, y: number): number {
  return x + y;
}

// DARKEN OR LIGHTEN A HEX COLOR BY A MULTIPLICATIVE FACTOR, USED FOR ISOMETRIC FACE SHADING
export function shade(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}
