import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { AchievementCatalogEntry, CareerRecord, CareerSummary, ScenarioCatalogEntry } from "../../types/game";

export interface DebriefData {
  loading: boolean;
  records: CareerRecord[];
  summary: CareerSummary | null;
  scenarios: ScenarioCatalogEntry[];
  achievements: AchievementCatalogEntry[];
}

const RETRY_DELAYS_MS = [1200, 2400];

// CAREER DATA FOR THE DEBRIEF. The run's own record is written by the backend as the run ends, so
// the first fetch can race it: while the newest record does not match this run's outcome, refetch a
// couple of times before settling for what is there. `loading` stays true until then, so the UI
// never shows "first run" text for data that simply has not arrived.
export function useDebriefData(victory: boolean): DebriefData {
  const [data, setData] = useState<DebriefData>({ loading: true, records: [], summary: null, scenarios: [], achievements: [] });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async (attempt: number) => {
      const [records, summary, scenarios, achievements] = await Promise.all([
        api.getCareerRecords("recorded_at").catch(() => [] as CareerRecord[]),
        api.getCareerSummary().catch(() => null),
        api.getScenarioCatalog().catch(() => [] as ScenarioCatalogEntry[]),
        api.getAchievementCatalog().catch(() => [] as AchievementCatalogEntry[]),
      ]);
      if (cancelled) return;
      const consistent = records.length > 0 && (records[0].outcome === "victory") === victory;
      if (!consistent && attempt < RETRY_DELAYS_MS.length) {
        timer = setTimeout(() => void load(attempt + 1), RETRY_DELAYS_MS[attempt]);
        return;
      }
      setData({ loading: false, records, summary, scenarios, achievements });
    };

    void load(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [victory]);

  return data;
}
