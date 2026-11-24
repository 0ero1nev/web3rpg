export type PersonaRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export type PersonaMetric = {
  label: string;
  displayValue: string;
  normalizedValue?: number;
  icon?: string;
};

export type PersonaCardData = {
  id: string;
  name: string;
  subtitle: string;
  artwork: string;
  /** Normal personas only — special personas never show a match percentage. */
  match?: number;
  rarity?: PersonaRarity;
  /** Special personas render a SPECIAL PERSONA badge instead of match/rarity. */
  special?: boolean;
  metrics: PersonaMetric[];
  quote: string[];
};

export type PersonaDefinition = {
  id: string;
  name: string;
  subtitle: string;
  artwork: string;
  metricLabels: readonly string[];
  quote: readonly string[];
};

export type SpecialPersonaId = "diogenes";

export type SpecialPersonaDefinition = {
  id: SpecialPersonaId;
  name: string;
  subtitle: string;
  badge: string;
  artwork: string;
  metricLabels: readonly string[];
  quote: readonly string[];
  /** Shorter card copy for layouts that need it. */
  altQuote: readonly string[];
  whyTitle: string;
  /** Lines may contain a {qualifyingSwaps} placeholder. */
  whyBody: readonly string[];
  punchline: readonly string[];
  zeroTradeCopy: {
    title: string;
    subtitle: string;
    lines: readonly string[];
  };
};

// These types deliberately sit between wallet analysis and the card UI.
export type WalletAnalysisResult = {
  walletId: string;
  metricsByPersona: Record<string, PersonaMetric[]>;
};

export type PersonaMatchResult = {
  personaId: string;
  match: number;
};
