import { ReactNode, RefObject, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { usePresenceFlag } from "../../hooks/usePresence";
import { registerModal } from "../../utils/modalStack";

export type ModalLayer = "dialog" | "system" | "critical" | "tutorial";

const LAYER_Z: Record<ModalLayer, string> = {
  dialog: "z-dialog",
  system: "z-system",
  critical: "z-critical",
  tutorial: "z-tutorial",
};

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
} as const;

interface ModalProps {
  open: boolean;
  // omit for a modal that must be answered (e.g. a timed CAB decision)
  onClose?: () => void;
  title?: string;
  labelledBy?: string;
  role?: "dialog" | "alertdialog";
  layer?: ModalLayer;
  size?: keyof typeof SIZE;
  backdropClass?: string;
  panelClass?: string;
  closeOnBackdrop?: boolean;
  // element to focus when the dialog opens; defaults to the first focusable control
  initialFocusRef?: RefObject<HTMLElement>;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// SHARED DIALOG SHELL: portal, backdrop, enter AND exit animation, focus trap with restore, and a
// slot in the Escape stack (the top-most dialog closes first). Header, footer and body are up to
// the caller; use <ModalHeader/>, <ModalBody/> and <ModalFooter/> for the standard layout.
export default function Modal({
  open,
  onClose,
  title,
  labelledBy,
  role = "dialog",
  layer = "dialog",
  size = "md",
  backdropClass = "bg-slate-950/75 backdrop-blur-sm",
  panelClass = "",
  closeOnBackdrop = true,
  initialFocusRef,
  children,
}: ModalProps) {
  const { mounted, closing } = usePresenceFlag(open, 160);
  const panelRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissible = Boolean(onClose);

  // slot in the Escape stack for as long as the dialog is actually open
  useEffect(() => {
    if (!open) return;
    return registerModal(reactId, dismissible ? () => onCloseRef.current?.() : null);
  }, [open, reactId, dismissible]);

  // focus management: remember what had focus, move into the dialog, hand it back on close
  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      const el = returnFocusTo.current;
      if (el && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef]);

  if (!mounted) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${LAYER_Z[layer]} flex items-center justify-center p-4 ${backdropClass} ${
        closing ? "animate-backdrop-out pointer-events-none" : "animate-backdrop-in"
      }`}
      onMouseDown={(e) => {
        if (closeOnBackdrop && onClose && e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`w-full ${SIZE[size]} max-h-[90vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl outline-none overflow-hidden ${
          closing ? "animate-modal-out" : "animate-modal-in"
        } ${panelClass}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

// STANDARD FIXED HEADER: the title never scrolls away, the body below it does
export function ModalHeader({
  title,
  id,
  icon,
  onClose,
  closeLabel = "Close",
  children,
  className = "",
}: {
  title: string;
  id?: string;
  icon?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-700 bg-slate-800/60 shrink-0 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <h2 id={id} className="text-base font-bold font-heading tracking-wide text-white truncate">
          {title}
        </h2>
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/70 transition-colors duration-fast"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex-1 min-h-0 overflow-y-auto ${className}`}>{children}</div>;
}

export function ModalFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700 bg-slate-800/40 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
