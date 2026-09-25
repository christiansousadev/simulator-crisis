import { boxFaces, shade } from "./isoMath";

interface IsoBoxProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color: string;
  topFactor?: number;
  rightFactor?: number;
  leftFactor?: number;
  stroke?: string;
  opacity?: number;
  className?: string;
}

// RENDER A FLAT-SHADED ISOMETRIC BOX FROM THREE POLYGON FACES
export default function IsoBox({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  color,
  topFactor = 1.18,
  rightFactor = 0.88,
  leftFactor = 0.68,
  stroke = "rgba(15,23,42,0.18)",
  opacity = 1,
  className,
}: IsoBoxProps) {
  const faces = boxFaces(x, y, z, w, d, h);
  return (
    <g className={className} opacity={opacity}>
      <polygon points={faces.faceLeft} fill={shade(color, leftFactor)} stroke={stroke} strokeWidth={0.6} />
      <polygon points={faces.faceRight} fill={shade(color, rightFactor)} stroke={stroke} strokeWidth={0.6} />
      <polygon points={faces.top} fill={shade(color, topFactor)} stroke={stroke} strokeWidth={0.6} />
    </g>
  );
}
