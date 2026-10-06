import { create } from "zustand";
import type { InfrastructureNodeType } from "../../types/game";

// WHICH NODE TYPE THE PLAYER HAS ARMED IN BUILD MODE, PUBLISHED BY THE PALETTE (an html overlay) FOR THE
// placement ghost drawn inside the svg scene. a tiny dedicated store because the armed type is local
// state of the office shell and the two live in different render trees.
export const useBuildGhost = create<{ armedNodeType: InfrastructureNodeType | null }>(() => ({ armedNodeType: null }));
