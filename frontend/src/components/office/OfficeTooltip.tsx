import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";
import { getOfficeHoverPos, subscribeOfficeHoverPos, useOfficeHoverId } from "./officeHover";

const STATUS_DOT: Record<Service["status"], string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-rose-500",
};

const OFFSET_X = 14;
const OFFSET_Y = 12;
const EDGE = 8;

// SLEEK FLOATING GAME TOOLTIP SHOWN WHILE HOVERING A RACK, DESK OR EMPLOYEE.
// It follows the pointer through a transform written straight to the element (position: fixed, so
// the client coordinates are used as they come), never through React state: the old version
// re-rendered the entire office on every mousemove.
function OfficeTooltip() {
  const t = useTranslation();
  const hoveredId = useOfficeHoverId();
  const service = useGameStore((s) => (hoveredId ? s.telemetry.services.find((sv) => sv.id === hoveredId) : undefined));
  const ref = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 160, h: 48 });

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = getOfficeHoverPos();
    const { w, h } = size.current;
    // flip to the other side of the pointer rather than run off the window
    const left = x + OFFSET_X + w > window.innerWidth - EDGE ? x - OFFSET_X - w : x + OFFSET_X;
    const top = y - OFFSET_Y - h < EDGE ? y + OFFSET_Y + 8 : y - OFFSET_Y - h;
    el.style.transform = `translate3d(${Math.max(EDGE, left)}px, ${Math.max(EDGE, top)}px, 0)`;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) size.current = { w: el.offsetWidth, h: el.offsetHeight };
    place();
  });

  useEffect(() => subscribeOfficeHoverPos(place), [place]);

  if (!service) return null;

  return (
    <div
      ref={ref}
      role="tooltip"
      className="fixed left-0 top-0 z-30 pointer-events-none"
      style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
    >
      <div className="animate-pop-in bg-slate-900/95 text-white rounded-lg px-3 py-2 text-xs shadow-xl min-w-[150px]">
        <div className="flex items-center gap-1.5 font-semibold mb-1">
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[service.status]}`} />
          {service.name}
        </div>
        <div className="flex items-center justify-between gap-4 text-[10px] text-slate-300 font-mono">
          <span>{t.status[service.status]}</span>
          <span>{service.latency_ms}ms</span>
          <span>{(service.error_rate * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

export default memo(OfficeTooltip);
