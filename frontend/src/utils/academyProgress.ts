// completed Flight Academy modules, remembered per browser (best effort: private mode just forgets)
const KEY = "incidentzero.academy_done";

export function readAcademyDone(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 4).sort() : [];
  } catch {
    return [];
  }
}

export function writeAcademyDone(done: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(done));
  } catch {
    // best-effort only
  }
}
