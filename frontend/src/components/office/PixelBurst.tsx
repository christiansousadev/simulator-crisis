import type { CSSProperties } from "react";
import { memo } from "react";

// a fixed pool of pixel particles: direction, spread and colour are precomputed once at module load,
// so a burst never allocates per event and two bursts of the same size look the same (the variety
// comes from where they fire, not from Math.random on render)
const PALETTE = ["#34d399", "#22d3ee", "#f8fafc", "#a7f3d0", "#67e8f9"];
const POOL = Array.from({ length: 16 }, (_, i) => {
  // fan the particles over the upper half circle, alternating wide and steep throws
  const angle = Math.PI * (0.08 + (0.84 * i) / 15);
  const reach = i % 2 === 0 ? 16 : 11;
  return {
    dx: Math.round(Math.cos(angle) * reach * (i % 3 === 0 ? 1.2 : 1)),
    dy: -Math.round(Math.sin(angle) * reach + (i % 4) * 2),
    color: PALETTE[i % PALETTE.length],
    delayMs: (i % 4) * 30,
  };
});

interface PixelBurstProps {
  x: number;
  y: number;
  // how many particles of the pool to throw (max 16)
  count?: number;
  testId?: string;
}

// SUCCESS BURST: 2x2 PIXEL CONFETTI THROWN UP FROM A POINT AND FALLING AWAY (ol-burst, 0.7s, steps(6)).
// Mount it for the length of the moment; under reduced motion the css switches it off and the
// accompanying text (e.g. RESTORED) carries the message on its own.
function PixelBurst({ x, y, count = 12, testId = "pixel-burst" }: PixelBurstProps) {
  return (
    <g data-testid={testId} transform={`translate(${Math.round(x)} ${Math.round(y)})`} shapeRendering="crispEdges" pointerEvents="none" className="motion-only">
      {POOL.slice(0, Math.min(POOL.length, count)).map((p, i) => (
        <rect
          key={i}
          x={-1}
          y={-1}
          width={2}
          height={2}
          fill={p.color}
          className="ol-burst-px"
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--delay": `${p.delayMs}ms` } as CSSProperties}
        />
      ))}
    </g>
  );
}

export default memo(PixelBurst);
