// presentation-only sla grading for the victory debriefing screen, no backend contract

export type SlaGrade = "S" | "A" | "B" | "C";

export function gradeForSla(slaPercentage: number): SlaGrade {
  if (slaPercentage >= 99.99) return "S";
  if (slaPercentage >= 99.9) return "A";
  if (slaPercentage >= 99.0) return "B";
  return "C";
}

export const GRADE_TONE: Record<SlaGrade, string> = {
  S: "text-sky-600",
  A: "text-emerald-600",
  B: "text-amber-600",
  C: "text-rose-600",
};
