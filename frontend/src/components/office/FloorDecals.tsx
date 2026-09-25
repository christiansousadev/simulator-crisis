import IsoBox from "./IsoBox";

interface ZoneBounds {
  originX: number;
  originY: number;
  width: number;
  depth: number;
}

// RAISED ANTI-STATIC TECHNICAL TILE GRID FOR THE SERVER ROOM FLOOR
export function ServerRoomTiles({ originX, originY, width, depth }: ZoneBounds) {
  const tileSize = 0.5;
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(depth / tileSize);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const alt = (r + c) % 2 === 0;
      tiles.push(
        <IsoBox
          key={`${r}-${c}`}
          x={originX + c * tileSize}
          y={originY + r * tileSize}
          z={0.022}
          w={tileSize}
          d={tileSize}
          h={0.02}
          color={alt ? "#cbd5e1" : "#b6c2d1"}
          stroke="rgba(71,85,105,0.25)"
        />
      );
    }
  }
  return <g>{tiles}</g>;
}

interface HazardStripeProps {
  axis: "x" | "y";
  fixed: number;
  from: number;
  to: number;
}

// ONE YELLOW/BLACK HAZARD STRIPE RUN
export function HazardStripe({ axis, fixed, from, to }: HazardStripeProps) {
  const stripeSize = 0.14;
  const count = Math.ceil((to - from) / stripeSize);
  const stripes = Array.from({ length: count }).map((_, i) => {
    const along = from + i * stripeSize;
    const footprint =
      axis === "x"
        ? { x: along, y: fixed, w: stripeSize, d: 0.12 }
        : { x: fixed, y: along, w: 0.12, d: stripeSize };
    return (
      <IsoBox
        key={i}
        x={footprint.x}
        y={footprint.y}
        z={0.024}
        w={footprint.w}
        d={footprint.d}
        h={0.002}
        color={i % 2 === 0 ? "#facc15" : "#18181b"}
        topFactor={1}
      />
    );
  });
  return <g>{stripes}</g>;
}

// FULL YELLOW/BLACK HAZARD BORDER RUNNING AROUND THE SERVER ROOM SECURITY PERIMETER
export function HazardBorder({ originX, originY, width, depth }: ZoneBounds) {
  return (
    <g>
      <HazardStripe axis="x" fixed={originY} from={originX} to={originX + width} />
      <HazardStripe axis="x" fixed={originY + depth} from={originX} to={originX + width} />
      <HazardStripe axis="y" fixed={originX} from={originY} to={originY + depth} />
      <HazardStripe axis="y" fixed={originX + width} from={originY} to={originY + depth} />
    </g>
  );
}

// DEEP NAVY EXECUTIVE CARPET WITH A WOVEN LIGHTER BORDER BAND
export function BoardroomRug({ originX, originY, width, depth }: ZoneBounds) {
  const border = 0.16;
  return (
    <g>
      <IsoBox x={originX} y={originY} z={0.021} w={width} d={depth} h={0.014} color="#2b3548" topFactor={1.15} stroke="rgba(0,0,0,0.3)" />
      <IsoBox
        x={originX + border}
        y={originY + border}
        z={0.023}
        w={width - border * 2}
        d={depth - border * 2}
        h={0.014}
        color="#1a2233"
        topFactor={1.05}
        stroke="rgba(0,0,0,0.2)"
      />
    </g>
  );
}

// CHECKERED TERRAZZO-STYLE TILE FLOOR FOR THE BREAKROOM LOUNGE
export function BreakroomTiles({ originX, originY, width, depth }: ZoneBounds) {
  const tileSize = 0.55;
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(depth / tileSize);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const alt = (r + c) % 2 === 0;
      tiles.push(
        <IsoBox
          key={`${r}-${c}`}
          x={originX + c * tileSize}
          y={originY + r * tileSize}
          z={0.022}
          w={tileSize}
          d={tileSize}
          h={0.015}
          color={alt ? "#fdf6e8" : "#c9ad84"}
          stroke="rgba(120,90,50,0.25)"
        />
      );
    }
  }
  return <g>{tiles}</g>;
}

// WOVEN ENTRANCE MAT MARKING THE RECEPTION LOUNGE THRESHOLD
export function EntranceMat({ originX, originY, width, depth }: ZoneBounds) {
  return (
    <g>
      <IsoBox x={originX} y={originY} z={0.021} w={width} d={depth} h={0.012} color="#334155" topFactor={1.1} />
      <IsoBox
        x={originX + 0.1}
        y={originY + 0.1}
        z={0.023}
        w={width - 0.2}
        d={depth - 0.2}
        h={0.012}
        color="#475569"
        topFactor={1.1}
      />
    </g>
  );
}

// SUBTLE DIRECTIONAL GUIDE LINE MARKING A WALKWAY BETWEEN TWO ZONES
export function WalkwayGuide({ axis, fixed, from, to }: HazardStripeProps) {
  const footprint =
    axis === "x" ? { x: from, y: fixed, w: to - from, d: 0.05 } : { x: fixed, y: from, w: 0.05, d: to - from };
  return <IsoBox x={footprint.x} y={footprint.y} z={0.023} w={footprint.w} d={footprint.d} h={0.001} color="#94a3b8" stroke="none" opacity={0.35} />;
}
