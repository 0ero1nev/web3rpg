import type { PersonaRarity } from "@/types/persona";

export function getRarity(matchScore: number): PersonaRarity {
  const score = Math.max(0, Math.min(100, matchScore));
  if (score < 65) return "COMMON";
  if (score < 75) return "RARE";
  if (score < 90) return "EPIC";
  return "LEGENDARY";
}
