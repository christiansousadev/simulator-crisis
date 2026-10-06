import { useEffect, useId, useRef } from "react";
import { Box, clampBoxToViewport, easeBox, padBox } from "./tutorialLayout";
import { resolveTargetBox } from "./tutorialTargets";
import type { TargetSpec } from "./tutorialSteps";

const HOLE_PAD = 8;
const HOLE_RADIUS = 12;
// smaller = snappier glide; ~120ms makes a full move settle in about 600ms
const GLIDE_TAU_MS = 130;

export interface SpotlightHoleProps {
  specs: TargetSpec[];
  union: boolean;
  serviceId: string | null;
  incidentId: string | null;
  // draw the dim layer (off while a gameplay modal brings its own backdrop)
  dim: boolean;
  // swallow clicks outside the hole; the hole itself always stays clickable
  block: boolean;
  // point at the target with a pulsing ring
  ring: boolean;
  success: boolean;
  reduced: boolean;
  // called every frame with the eased hole and the (padded) resolved target; both null = nothing highlighted
  onFrame: (hole: Box | null, target: Box | null) => void;
}

// THE SPOTLIGHT: a dim layer with a pointer-transparent hole, a pulsing ring and (when asked) four
// invisible click blockers around the hole. It re-resolves its target every frame (ResizeObserver
// alone cannot see a panning camera or a dock tab mounting later) and glides between targets by
// writing straight to the DOM, so no React state changes per frame.
export default function SpotlightHole({ specs, union, serviceId, incidentId, dim, block, ring, success, reduced, onFrame }: SpotlightHoleProps) {
  const maskId = `tut-mask-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const holeRef = useRef<SVGRectElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const blockerRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const fullBlockerRef = useRef<HTMLDivElement>(null);

  // the loop reads the latest props through a ref instead of restarting on every change
  const live = useRef({ specs, union, serviceId, incidentId, block, ring, reduced, onFrame });
  live.current = { specs, union, serviceId, incidentId, block, ring, reduced, onFrame };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let shown: Box | null = null;

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const cfg = live.current;
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      const raw = resolveTargetBox(cfg.specs, cfg.union, { serviceId: cfg.serviceId, incidentId: cfg.incidentId });
      const target = raw ? padBox(clampBoxToViewport(raw, viewport), HOLE_PAD) : null;

      if (target) {
        if (!shown) {
          // iris open from the target's center
          shown = cfg.reduced ? target : { x: target.x + target.w / 2, y: target.y + target.h / 2, w: 0, h: 0 };
        }
        shown = cfg.reduced ? target : easeBox(shown, target, dt, GLIDE_TAU_MS);
      } else if (shown) {
        // iris close toward where it was
        const center = { x: shown.x + shown.w / 2, y: shown.y + shown.h / 2, w: 0, h: 0 };
        shown = cfg.reduced ? null : easeBox(shown, center, dt, GLIDE_TAU_MS);
        if (shown && shown.w < 1 && shown.h < 1) shown = null;
      }

      const hole = shown;
      const holeEl = holeRef.current;
      if (holeEl) {
        holeEl.setAttribute("x", String(hole?.x ?? 0));
        holeEl.setAttribute("y", String(hole?.y ?? 0));
        holeEl.setAttribute("width", String(hole?.w ?? 0));
        holeEl.setAttribute("height", String(hole?.h ?? 0));
      }

      for (const el of [ringRef.current, pulseRef.current]) {
        if (!el) continue;
        if (hole && cfg.ring) {
          el.style.opacity = "1";
          el.style.transform = `translate(${hole.x}px, ${hole.y}px)`;
          el.style.width = `${hole.w}px`;
          el.style.height = `${hole.h}px`;
        } else {
          el.style.opacity = "0";
        }
      }

      // blockers follow the real target (not the eased hole) so the clickable area is exact
      const [top, bottom, left, right] = blockerRefs.current;
      const full = fullBlockerRef.current;
      if (cfg.block && target) {
        if (full) full.style.display = "none";
        const set = (el: HTMLDivElement | null, x: number, y: number, w: number, h: number) => {
          if (!el) return;
          el.style.display = w > 0 && h > 0 ? "block" : "none";
          el.style.transform = `translate(${x}px, ${y}px)`;
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
        };
        set(top, 0, 0, viewport.w, target.y);
        set(bottom, 0, target.y + target.h, viewport.w, viewport.h - (target.y + target.h));
        set(left, 0, target.y, target.x, target.h);
        set(right, target.x + target.w, target.y, viewport.w - (target.x + target.w), target.h);
      } else {
        for (const el of [top, bottom, left, right]) if (el) el.style.display = "none";
        if (full) full.style.display = cfg.block ? "block" : "none";
      }

      cfg.onFrame(hole, target);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ringTone = success ? "border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.55)]" : "border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.45)]";
  const pulseTone = success ? "border-emerald-400" : "border-cyan-400";

  return (
    <>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full pointer-events-none transition-opacity duration-slow"
        style={{ opacity: dim ? 1 : 0 }}
      >
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            <rect ref={holeRef} rx={HOLE_RADIUS} ry={HOLE_RADIUS} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(2, 6, 23, 0.78)" mask={`url(#${maskId})`} />
      </svg>

      {/* click blockers: everything outside the hole, so a stray click cannot undo the scripted state */}
      <div ref={fullBlockerRef} className="absolute inset-0 pointer-events-auto" style={{ display: "none" }} />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          ref={(el) => {
            blockerRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 pointer-events-auto"
          style={{ display: "none" }}
        />
      ))}

      {/* the pulse animates its own transform, so it lives on an inner element of the positioned box */}
      <div ref={pulseRef} aria-hidden="true" className="motion-only absolute left-0 top-0 pointer-events-none" style={{ opacity: 0 }}>
        <div className={`h-full w-full rounded-xl border-2 animate-ring-pulse ${pulseTone}`} />
      </div>
      <div
        ref={ringRef}
        aria-hidden="true"
        className={`absolute left-0 top-0 rounded-xl border-2 pointer-events-none transition-colors duration-base ${ringTone}`}
        style={{ opacity: 0 }}
      />
    </>
  );
}
