// stable per-browser player identity, used only to scope the local career/leaderboard
// records; it does not isolate the live shared simulation across concurrent clients

const PLAYER_ID_STORAGE_KEY = "incidentzero.player_id";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// GET THE PERSISTED PLAYER ID, GENERATING AND STORING A NEW ONE ON FIRST RUN
export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = generateId();
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return "local-player";
  }
}
