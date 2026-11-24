import { getRarity } from "@/lib/personaRarity";
import type { PersonaCardData, PersonaDefinition, PersonaMatchResult, WalletAnalysisResult } from "@/types/persona";

export function createPersonaCardData(
  definition: PersonaDefinition,
  analysis: WalletAnalysisResult,
  matchResult: PersonaMatchResult,
): PersonaCardData {
  return {
    id: definition.id,
    name: definition.name,
    subtitle: definition.subtitle,
    artwork: definition.artwork,
    match: matchResult.match,
    rarity: getRarity(matchResult.match),
    metrics: analysis.metricsByPersona[definition.id] ?? definition.metricLabels.map((label) => ({ label, displayValue: "—" })),
    quote: [...definition.quote],
  };
}
