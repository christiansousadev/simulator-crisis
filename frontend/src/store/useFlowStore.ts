import { create } from "zustand";

// TRANSIENT "SCREEN FLOW" STATE: purely presentational, never persisted and never sent anywhere.
// Kept out of useGameStore so the many agents editing that file never collide with it.
interface FlowState {
  // a scenario is being deployed (reset in flight): shows the progress overlay with this label
  deploying: { label: string } | null;
  // sequence of "shift started" banners (sandbox launches have no briefing card to hold the moment)
  shiftBannerSeq: number;
  // HUD pieces slide in one after the other right after the title screen is dismissed
  officeIntroSeq: number;
  officeIntro: boolean;
  // the title is on its way out: wipe overlay runs while it fades
  titleLeavingSeq: number;
  // achievements unlocked since this run started (see trackAchievements)
  runAchievements: string[];

  setRunAchievements: (ids: string[]) => void;
  setDeploying: (label: string | null) => void;
  announceShiftStarted: () => void;
  beginOfficeIntro: () => void;
  endOfficeIntro: () => void;
  markTitleLeaving: () => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  deploying: null,
  shiftBannerSeq: 0,
  officeIntroSeq: 0,
  officeIntro: false,
  titleLeavingSeq: 0,
  runAchievements: [],

  setRunAchievements: (ids) => set({ runAchievements: ids }),
  setDeploying: (label) => set({ deploying: label === null ? null : { label } }),
  announceShiftStarted: () => set((s) => ({ shiftBannerSeq: s.shiftBannerSeq + 1 })),
  beginOfficeIntro: () => set((s) => ({ officeIntro: true, officeIntroSeq: s.officeIntroSeq + 1 })),
  endOfficeIntro: () => set({ officeIntro: false }),
  markTitleLeaving: () => set((s) => ({ titleLeavingSeq: s.titleLeavingSeq + 1 })),
}));
