import { memo } from "react";
import { boxFaces, shade } from "./isoMath";

interface IsoBoxProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  topFactor?: number;
  rightFactor?: number;
  leftFactor?: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  className?: string;
  fillLeft?: string;
  fillRight?: string;
  fillTop?: string;
  highlightTop?: boolean;
  chamfer?: boolean;
  pixelOutline?: boolean;
}

// RENDER AN ISOMETRIC BOX WITH CRISP 2:1 PIXEL EDGES, CONTRAST CONTOURS AND DISCRETE STEPPED SHADING.
// Memoized: props are all primitives, so parent re-renders don't rebuild static geometry.
function IsoBoxImpl({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  color = "#64748b",
  topFactor = 1.18,
  rightFactor = 0.88,
  leftFactor = 0.68,
  stroke = "rgba(10,15,29,0.4)",
  strokeWidth = 0.8,
  opacity = 1,
  className,
  fillLeft,
  fillRight,
  fillTop,
  highlightTop,
  chamfer = false,
  pixelOutline = false,
}: IsoBoxProps) {
  const faces = boxFaces(x, y, z, w, d, h, chamfer);
  const actualStroke = pixelOutline ? "#090d16" : stroke;
  const actualWidth = pixelOutline ? 1.2 : strokeWidth;

  return (
    <g className={className} opacity={opacity} shapeRendering="crispEdges">
      <polygon
        points={faces.faceLeft}
        fill={fillLeft ?? shade(color, leftFactor)}
        stroke={actualStroke}
        strokeWidth={actualWidth}
        strokeLinejoin="miter"
      />
      <polygon
        points={faces.faceRight}
        fill={fillRight ?? shade(color, rightFactor)}
        stroke={actualStroke}
        strokeWidth={actualWidth}
        strokeLinejoin="miter"
      />
      <polygon
        points={faces.top}
        fill={fillTop ?? shade(color, topFactor)}
        stroke={actualStroke}
        strokeWidth={actualWidth}
        strokeLinejoin="miter"
      />
      {highlightTop && (
        <polygon
          points={faces.top}
          fill="none"
          stroke="rgba(255,255,255,0.24)"
          strokeWidth={0.8}
          strokeLinejoin="miter"
        />
      )}
    </g>
  );
}

const IsoBox = memo(IsoBoxImpl);
export default IsoBox;
