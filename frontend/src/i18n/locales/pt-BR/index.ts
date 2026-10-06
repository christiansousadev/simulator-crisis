import type { Translations } from "../../translations";
import { auditorChatPt } from "./auditorChat";
import { core } from "./core";
import { dynamicPt } from "./dynamic";
import { flowPt } from "./flow";
import { gameplayModalsPt } from "./gameplayModals";
import { hudPt } from "./hud";
import { officeLifePt } from "./officeLife";
import { uiGapsPt } from "./uiGaps";

// the complete dictionary for this locale; `satisfies` keeps the compile-time guarantee that it
// implements every key of the Translations interface (a missing or mistyped key fails tsc)
export const translations = {
  ...core,
  flow: flowPt,
  auditorChat: auditorChatPt,
  gameplayModals: gameplayModalsPt,
  hud: hudPt,
  officeLife: officeLifePt,
  uiGaps: uiGapsPt,
} satisfies Translations;

export const dynamic = dynamicPt;
