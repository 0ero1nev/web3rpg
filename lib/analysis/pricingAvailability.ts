import type { PersonaResult } from "../persona/personaResult";
import type { HistoricalPricingDiagnostics } from "./valuationTypes";

export function isMaterialHistoricalPricingOutage(
  qualifyingSwapCount: number,
  valuedSwapCount: number,
  diagnostics: HistoricalPricingDiagnostics,
) {
  return qualifyingSwapCount >= 10
    && diagnostics.status === "UNAVAILABLE"
    && valuedSwapCount === 0
    && diagnostics.requestedTimestampCount > 0;
}

export function applyHistoricalPricingAvailability(
  result: PersonaResult,
  qualifyingSwapCount: number,
  valuedSwapCount: number,
  diagnostics: HistoricalPricingDiagnostics,
): PersonaResult {
  if (!isMaterialHistoricalPricingOutage(
    qualifyingSwapCount,
    valuedSwapCount,
    diagnostics,
  )) return result;

  return {
    kind: "INCONCLUSIVE",
    reason: "HISTORICAL_PRICING_UNAVAILABLE",
    qualifyingSwaps: qualifyingSwapCount,
  };
}
