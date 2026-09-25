const CONFETTI_COLORS = ["#38bdf8", "#22c55e", "#fbbf24", "#f472b6", "#a78bfa"];
const PIECE_COUNT = 36;

// CSS-ONLY CONFETTI BURST, MOUNTED ONCE ON THE VICTORY SCREEN
export default function ConfettiBurst() {
  const pieces = Array.from({ length: PIECE_COUNT }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 2.6 + Math.random() * 1.2;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const size = 6 + Math.random() * 6;
    return (
      <span
        key={i}
        className="absolute top-0 animate-confetti-fall"
        style={{
          left: `${left}%`,
          width: size,
          height: size * 0.4,
          backgroundColor: color,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
        }}
      />
    );
  });

  return <div className="fixed inset-0 z-[75] pointer-events-none overflow-hidden">{pieces}</div>;
}
