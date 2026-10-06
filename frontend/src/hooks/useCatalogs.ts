import { useEffect, useSyncExternalStore } from "react";
import { api } from "../services/api";
import { AchievementCatalogEntry, CosmeticCatalogEntry } from "../types/game";

// MODULE-LEVEL CACHE FOR THE STATIC CATALOGS THE DOCK SHOWS. Fetched once (and prefetched when the
// dock mounts), so opening the tab never flashes an empty grid while a request is in flight.

export interface CatalogState<T> {
  data: T[] | null;
  loading: boolean;
  error: boolean;
}

export interface Catalog<T> {
  getState: () => CatalogState<T>;
  load: (force?: boolean) => void;
  subscribe: (cb: () => void) => () => void;
}

export function createCatalog<T>(fetcher: () => Promise<T[]>): Catalog<T> {
  let state: CatalogState<T> = { data: null, loading: false, error: false };
  const listeners = new Set<() => void>();
  const set = (next: CatalogState<T>) => {
    state = next;
    listeners.forEach((l) => l());
  };

  return {
    getState: () => state,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load: (force = false) => {
      if (state.loading || (state.data && !force)) return;
      set({ ...state, loading: true, error: false });
      fetcher()
        .then((data) => set({ data, loading: false, error: false }))
        // keep whatever we had so a failed refresh never blanks a grid that was already showing
        .catch(() => set({ data: state.data, loading: false, error: true }));
    },
  };
}

export const achievementCatalog = createCatalog<AchievementCatalogEntry>(() => api.getAchievementCatalog());
export const cosmeticCatalog = createCatalog<CosmeticCatalogEntry>(() => api.getCosmeticCatalog());

export function prefetchCatalogs() {
  achievementCatalog.load();
  cosmeticCatalog.load();
}

export function useCatalog<T>(catalog: Catalog<T>): CatalogState<T> & { reload: () => void } {
  const state = useSyncExternalStore(catalog.subscribe, catalog.getState, catalog.getState);
  useEffect(() => {
    catalog.load();
  }, [catalog]);
  return { ...state, reload: () => catalog.load(true) };
}
