import { ReactNode, RefObject, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "../../hooks/useDismissable";

interface HudPopoverProps {
  open: boolean;
  onClose: () => void;
  // the trigger button: anchors the popover and does not count as an outside press
  anchorRef: RefObject<HTMLElement>;
  // which side of the anchor the panel opens on
  placement: "top-start" | "bottom-end";
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}

const GAP = 6;
const EDGE = 8;

// A POPOVER THAT ESCAPES EVERY OVERFLOW/STACKING CONTEXT: portalled to <body> and positioned with
// fixed coordinates measured from its trigger, so a scrolling tab strip or a backdrop-filter
// ancestor can never clip it or hide it under the office overlays. Closes on outside press and Escape.
export default function HudPopover({ open, onClose, anchorRef, placement, id, label, className = "", children }: HudPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useDismissable(open, id, onClose, [panelRef, anchorRef as RefObject<HTMLElement>]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor) return;
      const a = anchor.getBoundingClientRect();
      const width = panel?.offsetWidth ?? 220;
      const maxLeft = window.innerWidth - width - EDGE;
      if (placement === "top-start") {
        setPos({ left: Math.max(EDGE, Math.min(a.left, maxLeft)), bottom: window.innerHeight - a.top + GAP });
      } else {
        setPos({ left: Math.max(EDGE, Math.min(a.right - width, maxLeft)), top: a.bottom + GAP });
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, placement, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={{ left: pos?.left ?? 0, top: pos?.top, bottom: pos?.bottom, visibility: pos ? "visible" : "hidden" }}
      className={`fixed z-dialog rounded-lg border border-slate-700 bg-slate-950/95 shadow-xl backdrop-blur-md animate-panel-in ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
