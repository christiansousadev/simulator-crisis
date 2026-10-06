import { useEffect, useRef } from "react";
import { playUiBackSound, playUiCloseSound, playUiOpenSound } from "../utils/sound";

type CloseSound = "back" | "close" | "none";

// OPEN/CLOSE FEEDBACK FOR A DIALOG, driven by its open flag so Escape, backdrop clicks and
// programmatic closes all sound the same. Only the exported UI sound API is used.
export function useDialogSounds(open: boolean, closeSound: CloseSound = "close", openSound = true) {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      if (openSound) playUiOpenSound();
    } else if (!open && wasOpen.current) {
      if (closeSound === "back") playUiBackSound();
      else if (closeSound === "close") playUiCloseSound();
    }
    wasOpen.current = open;
  }, [open, closeSound, openSound]);
}
