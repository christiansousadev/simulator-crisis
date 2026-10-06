import pkg from "../../package.json";
import { api } from "../services/api";

// version baked into this frontend build
export const FRONTEND_VERSION: string = pkg.version;

// BACKEND VERSION FROM GET /api/health, OR NULL WHEN THE BACKEND IS TOO OLD / UNREACHABLE
export async function fetchBackendVersion(): Promise<string | null> {
  try {
    const health = (await api.health()) as { version?: unknown };
    return typeof health.version === "string" && health.version ? health.version : null;
  } catch {
    return null;
  }
}

// ONE HONEST VERSION LINE: the server's own version when known, the package version otherwise
export function formatVersionLine(backendVersion: string | null, mode: string = import.meta.env.MODE): string {
  const version = backendVersion ?? FRONTEND_VERSION;
  return mode === "production" ? `v${version}` : `v${version} · ${mode}`;
}
