import { RefObject, useEffect } from "react";
import { registerModal } from "../utils/modalStack";

// CLOSES A POPOVER ON OUTSIDE PRESS AND ON ESCAPE. While open it also sits on the shared modal
// stack, so the global letter shortcuts stay quiet and Escape closes the popover instead of
// opening the pause menu. `ignore` refs (the trigger button) do not count as "outside".
export function useDismissable(
  open: boolean,
  id: string,
  onClose: () => void,
  refs: RefObject<HTMLElement>[]
) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && refs.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    // capture + stopPropagation: nothing else may react to this Escape (it only closes the popover)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };

    const unregister = registerModal(id, onClose);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      unregister();
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
    // refs are stable ref objects; onClose is intentionally read fresh through the closure below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);
}
