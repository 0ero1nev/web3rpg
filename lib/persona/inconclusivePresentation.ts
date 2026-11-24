import type { InconclusivePersonaResult } from "./personaResult";

export type InconclusivePresentation = {
  eyebrow: string;
  title: string;
  body: string;
  result?: string;
  cta: "TRY AGAIN" | "TRY ANOTHER WALLET";
};

export function getInconclusivePresentation(
  reason: InconclusivePersonaResult["reason"],
): InconclusivePresentation {
  if (reason === "HISTORICAL_PRICING_UNAVAILABLE") {
    return {
      eyebrow: "ANALYSIS INTERRUPTED",
      title: "MARKET DATA\nIS TEMPORARILY UNAVAILABLE.",
      body: "We couldn't load part of the historical market data needed to analyze this wallet. Your wallet data is fine. Try again in a moment.",
      cta: "TRY AGAIN",
    };
  }
  if (reason === "NO_ELIGIBLE_PERSONA") {
    return {
      eyebrow: "PERSONA INCONCLUSIVE",
      title: "YOUR WALLET IS\nHARD TO READ.",
      body: "We found enough trading activity, but not enough reliable evidence to assign a Persona.",
      result: "NOT ENOUGH RELIABLE EVIDENCE",
      cta: "TRY ANOTHER WALLET",
    };
  }
  return {
    eyebrow: "PERSONA INCONCLUSIVE",
    title: "YOUR WALLET IS\nHARD TO READ.",
    body: "We found enough trading activity to analyze this wallet, but none of the current Personas matched strongly enough.",
    result: "NO MATCH ≥ 50%",
    cta: "TRY ANOTHER WALLET",
  };
}
