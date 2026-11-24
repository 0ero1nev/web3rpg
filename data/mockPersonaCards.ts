import { personaDefinitions } from "@/data/personaDefinitions";
import { createPersonaCardData } from "@/lib/personaCards";
import type { PersonaCardData, PersonaMatchResult, WalletAnalysisResult } from "@/types/persona";

export const mockWalletAnalysis: WalletAnalysisResult = {
  walletId: "dev-persona-gallery",
  metricsByPersona: {
    newton: [
      { label: "EXIT TIMING", displayValue: "86", normalizedValue: 86, icon: "◷" },
      { label: "FOMO RESISTANCE", displayValue: "12", normalizedValue: 12, icon: "♦" },
      { label: "RE-ENTRY CONTROL", displayValue: "08", normalizedValue: 8, icon: "↻" },
      { label: "RECOVERY", displayValue: "31", normalizedValue: 31, icon: "↗" },
    ],
    icarus: [
      { label: "PEAK RETURN", displayValue: "+640%", normalizedValue: 92, icon: "♠" },
      { label: "REALIZED RETURN", displayValue: "+21%", normalizedValue: 34, icon: "♦" },
      { label: "EXIT DISCIPLINE", displayValue: "04", normalizedValue: 4, icon: "◷" },
      { label: "ALTITUDE LOST", displayValue: "619%", normalizedValue: 86, icon: "⌁" },
    ],
    midas: [
      { label: "UNREALIZED PNL", displayValue: "+18,421", normalizedValue: 91, icon: "◷" },
      { label: "REALIZED PNL", displayValue: "+312", normalizedValue: 22, icon: "♦" },
      { label: "HOLDING POWER", displayValue: "97", normalizedValue: 97, icon: "⌁" },
      { label: "PROFIT TAKING", displayValue: "09", normalizedValue: 9, icon: "♠" },
    ],
    sisyphus: [
      { label: "TOTAL TRADES", displayValue: "428", normalizedValue: 76, icon: "◷" },
      { label: "TOTAL VOLUME", displayValue: "$184K", normalizedValue: 63, icon: "♦" },
      { label: "NET PNL", displayValue: "+$37", normalizedValue: 18, icon: "⌁" },
      { label: "PROGRESS", displayValue: "0.02%", normalizedValue: 2, icon: "↗" },
    ],
    "don-quixote": [
      { label: "TOKEN DOWN", displayValue: "-96%", normalizedValue: 4, icon: "♦" },
      { label: "HOLDING DAYS", displayValue: "487", normalizedValue: 94, icon: "◷" },
      { label: "AVG ENTRY", displayValue: "$0.42", normalizedValue: 52, icon: "↻" },
      { label: "CONVICTION", displayValue: "99", normalizedValue: 99, icon: "↗" },
    ],
    caesar: [
      { label: "LARGEST POSITION", displayValue: "72%", normalizedValue: 72, icon: "♠" },
      { label: "POSITION GROWTH", displayValue: "+3.4x", normalizedValue: 82, icon: "↗" },
      { label: "CONVICTION", displayValue: "91", normalizedValue: 91, icon: "♦" },
      { label: "DIVERSIFICATION", displayValue: "08", normalizedValue: 8, icon: "⌁" },
    ],
    napoleon: [
      { label: "WIN STREAK", displayValue: "7", normalizedValue: 70, icon: "◷" },
      { label: "RISK EXPOSURE", displayValue: "3.8x", normalizedValue: 86, icon: "⌁" },
      { label: "LARGEST LOSS", displayValue: "-68%", normalizedValue: 68, icon: "♠" },
      { label: "OVERCONFIDENCE", displayValue: "92", normalizedValue: 92, icon: "♦" },
    ],
    croesus: [
      { label: "WALLET SIZE", displayValue: "$2.4M", normalizedValue: 96, icon: "◷" },
      { label: "AVG TRADE SIZE", displayValue: "$48K", normalizedValue: 78, icon: "♦" },
      { label: "TOP HOLDING", displayValue: "35%", normalizedValue: 35, icon: "⌁" },
      { label: "WHALE SCORE", displayValue: "91", normalizedValue: 91, icon: "↗" },
    ],
  },
};

export const mockMatchResults: PersonaMatchResult[] = [
  { personaId: "newton", match: 94 },
  { personaId: "icarus", match: 88 },
  { personaId: "midas", match: 91 },
  { personaId: "sisyphus", match: 72 },
  { personaId: "don-quixote", match: 64 },
  { personaId: "caesar", match: 87 },
  { personaId: "napoleon", match: 79 },
  { personaId: "croesus", match: 90 },
];

export const mockPersonaCards: PersonaCardData[] = personaDefinitions.map((definition) => {
  const match = mockMatchResults.find((result) => result.personaId === definition.id) ?? { personaId: definition.id, match: 50 };
  return createPersonaCardData(definition, mockWalletAnalysis, match);
});
