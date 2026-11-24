export type BehaviorDimensionId =
  | "ACTIVITY"
  | "TURNOVER"
  | "REPETITION"
  | "CONCENTRATION"
  | "DIVERSIFICATION"
  | "REENTRY"
  | "FOMO_REENTRY"
  | "HOLDING"
  | "PROFITABILITY"
  | "EFFICIENCY"
  | "TRADE_SIZE"
  | "RISK_EXPANSION";

export type PersonaId =
  | "sisyphus"
  | "newton"
  | "caesar"
  | "croesus"
  | "icarus"
  | "midas"
  | "don_quixote"
  | "napoleon";

export type PersonaEvidence = {
  label: string;
  value: string;
  strength: number;
};

export type BehaviorScore = {
  value: number | null;
  confidence: number;
  sampleSize: number;
  evidence: PersonaEvidence[];
};

export type BehaviorScores = Record<BehaviorDimensionId, BehaviorScore>;

export type PersonaScore = {
  personaId: PersonaId;
  match: number | null;
  /** @deprecated Compatibility alias for match. */
  score: number | null;
  confidence: number;
  eligible: boolean;
  evidence: PersonaEvidence[];
  missingEvidence: string[];
};

export type PersonaResultReason =
  | "INSUFFICIENT_HISTORY"
  | "NO_ELIGIBLE_PERSONA"
  | "NO_STRONG_MATCH";

export type PersonaRanking = {
  scores: PersonaScore[];
  eligibleScores: PersonaScore[];
  winner: PersonaScore | null;
  runnerUp: PersonaScore | null;
  dimensions: BehaviorScores;
  qualifyingSwaps: number;
  requiredQualifyingSwaps: number;
  resultReason: PersonaResultReason | null;
};

/**
 * Product-level routing outcome. Special personas never carry a Match;
 * inconclusive keeps the full ranking for diagnostics without assigning one.
 */
export type PersonaOutcome =
  | {
      kind: "NORMAL_PERSONA";
      personaId: PersonaId;
      match: number;
      confidence: number;
      ranking: PersonaRanking;
    }
  | {
      kind: "SPECIAL_PERSONA";
      personaId: "diogenes";
      reason: "INSUFFICIENT_HISTORY";
      qualifyingSwaps: number;
      requiredQualifyingSwaps: number;
    }
  | {
      kind: "PERSONA_INCONCLUSIVE";
      reason: Exclude<PersonaResultReason, "INSUFFICIENT_HISTORY">;
      ranking: PersonaRanking;
    };
