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
}

// RENDER AN ISOMETRIC BOX WITH OPTIONAL SHADER/BEVEL EDGE HIGHLIGHTS AND CUSTOM GRADIENT FILLS.
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
  stroke = "rgba(15,23,42,0.18)",
  strokeWidth = 0.6,
  opacity = 1,
  className,
  fillLeft,
  fillRight,
  fillTop,
  highlightTop,
}: IsoBoxProps) {
  const faces = boxFaces(x, y, z, w, d, h);
  return (
    <g className={className} opacity={opacity}>
      <polygon points={faces.faceLeft} fill={fillLeft ?? shade(color, leftFactor)} stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={faces.faceRight} fill={fillRight ?? shade(color, rightFactor)} stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={faces.top} fill={fillTop ?? shade(color, topFactor)} stroke={stroke} strokeWidth={strokeWidth} />
      {highlightTop && (
        <polygon
          points={faces.top}
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

const IsoBox = memo(IsoBoxImpl);
export default IsoBox;
