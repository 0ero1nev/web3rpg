import type { PersonaCardData, SpecialPersonaDefinition } from "@/types/persona";

/**
 * Special personas sit OUTSIDE the normal eight: no Match, no rarity, no
 * calibration or leaderboard statistics. Diogenes routes wallets whose
 * qualifying trading history is below the normal minimum (currently 10
 * qualifying swaps) — it states low observed activity, nothing more.
 */
export const DIOGENES: SpecialPersonaDefinition = {
  id: "diogenes",
  name: "DIOGENES",
  subtitle: "THE UNBOTHERED",
  badge: "SPECIAL PERSONA",
  artwork: "/personas/diogenes.webp",
  metricLabels: [
    "QUALIFYING TRADES",
    "FOMO RESISTANCE",
    "MARKET PARTICIPATION",
    "TOUCHING GRASS",
  ],
  quote: [
    "The market can't liquidate you",
    "if you never enter the market.",
  ],
  altQuote: [
    "Can't lose the trade",
    "if you never take it.",
  ],
  whyTitle: "WHY DIOGENES?",
  whyBody: [
    "Diogenes rejected wealth, status, and the usual rules of society.",
    "Your wallet seems to have rejected something too:",
    "trading.",
    "With only {qualifyingSwaps} qualifying trades in the analyzed history, there isn't enough activity to assign one of the normal trading Personas reliably.",
    "So instead of pretending we know your trading psychology, you get Diogenes.",
  ],
  punchline: [
    "The market can't liquidate you",
    "if you never enter the market.",
  ],
  zeroTradeCopy: {
    title: "YOUR WALLET HAS CHOSEN PEACE.",
    subtitle: "0 QUALIFYING TRADES",
    lines: [
      "The market moved.",
      "Your wallet did not.",
    ],
  },
};

export const SPECIAL_PERSONAS = [DIOGENES] as const;

export function getSpecialPersonaDefinition(id: string) {
  return SPECIAL_PERSONAS.find((persona) => persona.id === id);
}

/**
 * Presentation-layer card data for Diogenes. Only QUALIFYING TRADES is
 * measured wallet data; the other three are clearly comedic presentation
 * labels and must never be stored or used as analytical behavior scores.
 */
export function buildDiogenesCardData(qualifyingSwaps: number): PersonaCardData {
  return {
    id: DIOGENES.id,
    name: DIOGENES.name,
    subtitle: DIOGENES.subtitle,
    artwork: DIOGENES.artwork,
    special: true,
    metrics: [
      { label: "QUALIFYING TRADES", displayValue: String(qualifyingSwaps), normalizedValue: Math.min(100, qualifyingSwaps * 10) },
      { label: "FOMO RESISTANCE", displayValue: "MAX", normalizedValue: 100 },
      { label: "MARKET PARTICIPATION", displayValue: "LOW", normalizedValue: 15 },
      { label: "TOUCHING GRASS", displayValue: "MAX", normalizedValue: 100 },
    ],
    quote: qualifyingSwaps === 0
      ? [...DIOGENES.zeroTradeCopy.lines]
      : [...DIOGENES.quote],
  };
}

/** WHY DIOGENES? explanation block with the literal qualifying-trade count. */
export function buildDiogenesWhyCopy(qualifyingSwaps: number) {
  return {
    title: DIOGENES.whyTitle,
    body: DIOGENES.whyBody.map((line) => line.replaceAll("{qualifyingSwaps}", String(qualifyingSwaps))),
    punchline: [...DIOGENES.punchline],
    zeroTrade: qualifyingSwaps === 0 ? DIOGENES.zeroTradeCopy : null,
  };
}
