import { useMemo } from "react";

interface LiveSparklineProps {
  data: number[];
  color?: string;
  tone?: "cyan" | "rose" | "amber" | "emerald";
  width?: number | string;
  height?: number;
  showArea?: boolean;
  fillOpacity?: number;
  strokeWidth?: number;
  min?: number;
  max?: number;
}

const TONE_COLORS: Record<string, string> = {
  cyan: "#38bdf8",
  rose: "#f43f5e",
  amber: "#f59e0b",
  emerald: "#10b981",
};

export default function LiveSparkline({
  data,
  color,
  tone = "cyan",
  width = "100%",
  height = 36,
  showArea = true,
  fillOpacity = 0.2,
  strokeWidth = 1.75,
  min,
  max,
}: LiveSparklineProps) {
  const effectiveColor = color || TONE_COLORS[tone] || "#38bdf8";
  const internalWidth = 120;
  const internalHeight = 36;

  const points = useMemo(() => {
    if (!data || data.length === 0) return "";
    const effectiveMin = min ?? Math.min(...data);
    const effectiveMax = max ?? Math.max(...data);
    const range = effectiveMax - effectiveMin || 1;

    return data
      .map((val, i) => {
        const x = (i / Math.max(1, data.length - 1)) * internalWidth;
        const normalized = Math.max(0, Math.min(1, (val - effectiveMin) / range));
        const y = internalHeight - normalized * (internalHeight - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, min, max]);

  if (!points) return null;

  const gradId = `sparkGrad-${effectiveColor.replace(/[^a-zA-Z0-9]/g, "")}`;
  const lastPoint = points.split(" ").slice(-1)[0]?.split(",");
  const lastX = lastPoint ? Number(lastPoint[0]) : null;
  const lastY = lastPoint ? Number(lastPoint[1]) : null;

  return (
    <svg
      viewBox={`0 0 ${internalWidth} ${internalHeight}`}
      preserveAspectRatio="none"
      style={{ width, height: `${height}px` }}
      className="overflow-visible select-none inline-block w-full"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={effectiveColor} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={effectiveColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Fill area under curve */}
      {showArea && (
        <polygon
          points={`0,${internalHeight} ${points} ${internalWidth},${internalHeight}`}
          fill={`url(#${gradId})`}
        />
      )}
      {/* Sparkline curve */}
      <polyline
        points={points}
        fill="none"
        stroke={effectiveColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current point pulsing dot */}
      {lastX !== null && lastY !== null && (
        <circle
          cx={lastX}
          cy={lastY}
          r={2.5}
          fill={effectiveColor}
          className="animate-pulse"
        />
      )}
    </svg>
  );
}
