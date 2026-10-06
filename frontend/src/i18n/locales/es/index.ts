import type { Translations } from "../../translations";
import { auditorChatEs } from "./auditorChat";
import { core } from "./core";
import { dynamicEs } from "./dynamic";
import { flowEs } from "./flow";
import { gameplayModalsEs } from "./gameplayModals";
import { hudEs } from "./hud";
import { officeLifeEs } from "./officeLife";
import { uiGapsEs } from "./uiGaps";

// the complete dictionary for this locale; `satisfies` keeps the compile-time guarantee that it
// implements every key of the Translations interface (a missing or mistyped key fails tsc)
export const translations = {
  ...core,
  flow: flowEs,
  auditorChat: auditorChatEs,
  gameplayModals: gameplayModalsEs,
  hud: hudEs,
  officeLife: officeLifeEs,
  uiGaps: uiGapsEs,
} satisfies Translations;

export const dynamic = dynamicEs;
