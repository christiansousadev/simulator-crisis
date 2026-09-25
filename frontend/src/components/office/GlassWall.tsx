import IsoBox from "./IsoBox";

interface GlassWallProps {
  axis: "x" | "y";
  fixed: number;
  from: number;
  to: number;
  height?: number;
  doorFrom?: number;
  doorTo?: number;
}

const GLASS_COLOR = "#bfdbfe";
const FRAME_COLOR = "#94a3b8";
const THICKNESS = 0.05;
const POST_SIZE = 0.08;

interface Span {
  x: number;
  y: number;
  w: number;
  d: number;
}

// BUILD THE FOOTPRINT OF ONE STRAIGHT WALL SPAN ALONG THE GIVEN AXIS
function spanFootprint(axis: "x" | "y", fixed: number, from: number, to: number): Span {
  return axis === "x"
    ? { x: from, y: fixed, w: to - from, d: THICKNESS }
    : { x: fixed, y: from, w: THICKNESS, d: to - from };
}

// GLASS PARTITION WALL WITH ALUMINUM FRAME POSTS, OPTIONALLY SPLIT BY A DOORWAY GAP
export default function GlassWall({ axis, fixed, from, to, height = 0.85, doorFrom, doorTo }: GlassWallProps) {
  const spans: [number, number][] =
    doorFrom !== undefined && doorTo !== undefined
      ? [
          [from, doorFrom],
          [doorTo, to],
        ]
      : [[from, to]];

  return (
    <g>
      {spans.map(([a, b], i) => {
        if (b <= a) return null;
        const footprint = spanFootprint(axis, fixed, a, b);
        const postA = axis === "x" ? { x: a - POST_SIZE / 2, y: fixed - POST_SIZE / 2 } : { x: fixed - POST_SIZE / 2, y: a - POST_SIZE / 2 };
        const postB = axis === "x" ? { x: b - POST_SIZE / 2, y: fixed - POST_SIZE / 2 } : { x: fixed - POST_SIZE / 2, y: b - POST_SIZE / 2 };
        return (
          <g key={i}>
            <IsoBox {...footprint} h={height} color={GLASS_COLOR} opacity={0.38} topFactor={1.4} rightFactor={1.15} leftFactor={0.95} />
            <IsoBox x={postA.x} y={postA.y} w={POST_SIZE} d={POST_SIZE} h={height} color={FRAME_COLOR} />
            <IsoBox x={postB.x} y={postB.y} w={POST_SIZE} d={POST_SIZE} h={height} color={FRAME_COLOR} />
          </g>
        );
      })}
    </g>
  );
}
