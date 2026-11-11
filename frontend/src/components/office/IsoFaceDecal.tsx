import type { ReactNode } from "react";
import { project } from "./isoMath";

// screen-space slope of a grid axis under the 2:1 projection: one tile along x moves 32px right and
// 16px down (+0.5); along y it moves 32px left and 16px down, which read left-to-right is -0.5
export const FACE_SLOPE = { x: 0.5, y: -0.5 } as const;

// the 2d affine that maps a face's flat local space (u = screen px along the face, v = screen px
// downward) onto that face's isometric plane. Exported so the geometry is unit-testable.
export function faceTransform(x: number, y: number, z: number, axis: "x" | "y"): string {
  const origin = project(x, y, z);
  return `translate(${origin.x} ${origin.y}) matrix(1 ${FACE_SLOPE[axis]} 0 1 0 0)`;
}

// local width (in u px) of a face spanning `length` grid units: both axes advance 32px per tile
export function faceWidth(length: number): number {
  return length * 32;
}

interface IsoFaceDecalProps {
  // top-left corner of the decal, as seen by the viewer, in grid units. For an "x" face that is the
  // low-x end; for a "y" face (read left-to-right) it is the high-y end.
  x: number;
  y: number;
  z: number;
  axis: "x" | "y";
  opacity?: number;
  className?: string;
  children: ReactNode;
}

// PIXEL DETAIL PAINTED FLAT ONTO A VERTICAL ISOMETRIC FACE (whiteboard sketches, signage, labels).
// Children are drawn as plain axis-aligned rects in local px; the skew lays them on the 2:1 plane and
// crispEdges keeps every edge on hard pixel steps, matching IsoBox.
export default function IsoFaceDecal({ x, y, z, axis, opacity = 1, className, children }: IsoFaceDecalProps) {
  return (
    <g transform={faceTransform(x, y, z, axis)} opacity={opacity} className={className} shapeRendering="crispEdges" pointerEvents="none">
      {children}
    </g>
  );
}
