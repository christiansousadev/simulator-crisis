import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { MitigationActionId } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { TUTORIAL_MODAL_ID, useTutorialEngine } from "../../hooks/useTutorialEngine";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useGameStore } from "../../store/useGameStore";
import { topModalId, useModalStackSize } from "../../utils/modalStack";
import CoachCard, { RecapStats } from "./CoachCard";
import { bestRunbookFor, effectivenessPercent, TUTORIAL_CAUSE } from "./mitigationMatrix";
import SpotlightHole from "./SpotlightHole";
import { Box, easeBox, placeCard, ResolvedPlacement, Size } from "./tutorialLayout";
import { bodyVariant, formatTutorialDuration } from "./tutorialSteps";

const CARD_TAU_MS = 130;
// room between the hole and the card for the pointing arrow
const CARD_GAP = 30;
const ARROW_SIZE = 20;

// the guided tour layer: spotlight, pointing arrow and the coach card, in a portal above every dialog.
// Non-modal on purpose: the player must always be able to click the highlighted control.
export default function TutorialOverlay() {
  const t = useTranslation();
  const reduced = useReducedMotion();
  const engine = useTutorialEngine();
  const { step, snapshot } = engine;

  // a dialog opened on top of the tour (settings, detail, the log terminal) brings its own backdrop
  useModalStackSize();
  const modalOnTop = topModalId() !== TUTORIAL_MODAL_ID;
  const detailOpen = useGameStore((s) => s.selectedIncident !== null);
  const terminalOpen = useGameStore((s) => s.triageIncidentId !== null);
  const dilemmaOpen = useGameStore((s) => s.activeDilemma !== null);
  const gameplayModalOpen = modalOnTop || detailOpen || terminalOpen || dilemmaOpen;

  const dim = !gameplayModalOpen;
  const block = dim && step.kind === "info";
  // a modal the step did not ask for would sit between the player and the ring
  const ring = !gameplayModalOpen || Boolean(step.allowsGameplayModal);

  const variant = bodyVariant(step.id, snapshot);
  const copy = t.tutorial.steps[step.id];
  const body = variant === "alt" && copy.alt ? copy.alt : copy.body;

  const hint = useMemo(() => {
    const id = engine.mismatchActionId;
    if (!id || snapshot.source !== "tutorial") return null;
    const pct = effectivenessPercent(id, TUTORIAL_CAUSE);
    if (pct === null || pct >= 100) return null;
    const names = t.mitigations.actions;
    return t.tutorial.mismatchHint(names[id as MitigationActionId].name, pct, names[bestRunbookFor(TUTORIAL_CAUSE)].name);
  }, [engine.mismatchActionId, snapshot.source, t]);

  // recap numbers of the practice incident: its own MTTA/MTTR and what the session spent since
  const resolved = useGameStore((s) => (snapshot.incidentId ? s.resolvedHistory.find((i) => i.id === snapshot.incidentId) : undefined));
  const startBudget = useGameStore((s) => s.tutorial.startBudget);
  const budget = useGameStore((s) => s.telemetry.budget);
  const recap: RecapStats | null =
    step.id === "recap" && snapshot.incidentGone
      ? {
          mtta: resolved ? formatTutorialDuration(resolved.mtta_seconds) : null,
          mttr: resolved ? formatTutorialDuration(resolved.mttr_seconds) : null,
          spent: startBudget !== null ? `$${Math.max(0, Math.round(startBudget - budget)).toLocaleString()}` : null,
        }
      : null;

  // ---- per-frame placement of the card and arrow (DOM writes, no React state)
  const wrapRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<Size>({ w: 0, h: 0 });
  const cardPos = useRef<Box | null>(null);
  const live = useRef({ placement: step.placement, ring, reduced });
  live.current = { placement: step.placement, ring, reduced };
  const dtRef = useRef(performance.now());

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      sizeRef.current = { w: wrap.offsetWidth, h: wrap.offsetHeight };
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const handleFrame = useCallback((hole: Box | null, target: Box | null) => {
    const wrap = wrapRef.current;
    const cfg = live.current;
    const now = performance.now();
    const dt = Math.min(64, now - dtRef.current);
    dtRef.current = now;
    const size = sizeRef.current;
    if (!wrap || size.w === 0) return;

    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const placed = placeCard({ target, card: size, viewport, preferred: cfg.placement, gap: CARD_GAP });
    const desired: Box = { x: placed.x, y: placed.y, w: 0, h: 0 };
    cardPos.current = !cardPos.current || cfg.reduced ? desired : easeBox(cardPos.current, desired, dt, CARD_TAU_MS);
    wrap.style.transform = `translate(${Math.round(cardPos.current.x)}px, ${Math.round(cardPos.current.y)}px)`;
    wrap.style.opacity = "1";

    const arrow = arrowRef.current;
    if (!arrow) return;
    if (!hole || !cfg.ring || placed.placement === "center" || hole.w < 4) {
      arrow.style.opacity = "0";
      return;
    }
    arrow.style.opacity = "1";
    const cx = hole.x + hole.w / 2 - ARROW_SIZE / 2;
    const cy = hole.y + hole.h / 2 - ARROW_SIZE / 2;
    const pose: Record<Exclude<ResolvedPlacement, "center">, { x: number; y: number; rot: number }> = {
      top: { x: cx, y: hole.y - ARROW_SIZE - 6, rot: 0 },
      bottom: { x: cx, y: hole.y + hole.h + 6, rot: 180 },
      left: { x: hole.x - ARROW_SIZE - 6, y: cy, rot: -90 },
      right: { x: hole.x + hole.w + 6, y: cy, rot: 90 },
    };
    const p = pose[placed.placement];
    arrow.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) rotate(${p.rot}deg)`;
  }, []);

  // ---- keyboard: Enter = primary action when nothing else owns focus (Escape rides the modal stack)
  const primaryRef = useRef(engine);
  primaryRef.current = engine;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented) return;
      if (topModalId() !== TUTORIAL_MODAL_ID) return;
      const active = document.activeElement;
      const ownsFocus = !active || active === document.body || active.getAttribute("role") === "dialog";
      if (!ownsFocus) return;
      const eng = primaryRef.current;
      if (eng.snapshot.phase === "creating" && eng.step.id === "rack") return;
      e.preventDefault();
      eng.next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const announcement = `${copy.title}. ${body}${engine.waiting && copy.action ? ` ${t.tutorial.waitingFor(copy.action)}` : ""}`;

  return createPortal(
    <div
      data-tutorial-root
      className={`fixed inset-0 z-tutorial pointer-events-none transition-opacity duration-fast ${engine.leaving ? "opacity-0" : "opacity-100"}`}
    >
      <SpotlightHole
        specs={step.targets}
        union={Boolean(step.union)}
        serviceId={snapshot.serviceId}
        incidentId={snapshot.incidentId}
        dim={dim}
        block={block}
        ring={ring}
        success={engine.success}
        reduced={reduced}
        onFrame={handleFrame}
      />

      <div ref={arrowRef} aria-hidden="true" className="absolute left-0 top-0 pointer-events-none" style={{ opacity: 0, width: ARROW_SIZE, height: ARROW_SIZE }}>
        <div className="animate-bounce">
          <svg viewBox="0 0 20 20" width={ARROW_SIZE} height={ARROW_SIZE} className={engine.success ? "text-emerald-400" : "text-cyan-300"}>
            <path d="M3 5 L10 16 L17 5 Z" fill="currentColor" stroke="rgba(2,6,23,0.7)" strokeWidth="1" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div ref={wrapRef} className="absolute left-0 top-0 pointer-events-auto will-change-transform" style={{ opacity: 0 }}>
        <CoachCard
          key={step.id}
          stepId={step.id}
          index={engine.index}
          total={engine.total}
          title={copy.title}
          body={body}
          action={copy.action}
          waiting={engine.waiting}
          success={engine.success}
          alreadyHeld={engine.alreadyHeld}
          preparing={engine.preparing}
          hint={hint}
          recap={recap}
          canBack={engine.canBack}
          isLast={engine.isLast}
          onBack={engine.back}
          onNext={engine.next}
          onLeave={engine.leave}
        />
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>,
    document.body
  );
}
