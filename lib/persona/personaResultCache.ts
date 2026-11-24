import type { PersonaResult } from "./personaResult";

const CACHE_PREFIX = "web3rpg:persona-result:v1:";
export const PERSONA_RESULT_BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedPersonaResult = {
  expiresAt: number;
  result: PersonaResult;
  partialHistory: boolean;
};

export function readCachedPersonaResult(address: string): Pick<CachedPersonaResult, "result" | "partialHistory"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${address}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedPersonaResult>;
    if (!cached.expiresAt || cached.expiresAt <= Date.now() || !cached.result) {
      window.localStorage.removeItem(`${CACHE_PREFIX}${address}`);
      return null;
    }
    return { result: cached.result, partialHistory: cached.partialHistory === true };
  } catch {
    return null;
  }
}

export function writeCachedPersonaResult(address: string, result: PersonaResult, partialHistory = false): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedPersonaResult = {
      expiresAt: Date.now() + PERSONA_RESULT_BROWSER_CACHE_TTL_MS,
      result,
      partialHistory,
    };
    window.localStorage.setItem(`${CACHE_PREFIX}${address}`, JSON.stringify(cached));
  } catch {
    // Storage can be unavailable in private/restricted browser contexts. The
    // server cache remains the fallback and analysis correctness is unchanged.
  }
}
