import { useEffect, useMemo, useState } from "react";

const CONFETTI_COLORS = ["#38bdf8", "#22c55e", "#fbbf24", "#f472b6", "#a78bfa"];
const PIECE_COUNT = 36;
// longest delay (0.6s) + longest fall (3.8s), plus margin: after this nothing is left to see
const LIFETIME_MS = 5000;

interface Piece {
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
}

// ONE STABLE SET OF PIECES PER MOUNT (a re-render used to re-roll every piece mid-fall)
function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.6 + Math.random() * 1.2,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
}

// CSS-ONLY CONFETTI BURST. Decorative: hidden entirely under reduced motion (frozen pieces would
// just sit at the top) and unmounted once the last piece has landed.
export default function ConfettiBurst() {
  const pieces = useMemo(makePieces, []);
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setAlive(false), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!alive) return null;
  return (
    <div aria-hidden="true" className="motion-only fixed inset-0 z-[84] pointer-events-none overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
