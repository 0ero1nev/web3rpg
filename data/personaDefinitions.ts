import type { PersonaDefinition } from "@/types/persona";

export const personaDefinitions = [
  {
    id: "newton", name: "ISAAC NEWTON", subtitle: "THE FOMO GENIUS", artwork: "/personas/newton.png",
    metricLabels: ["EXIT TIMING", "FOMO RESISTANCE", "RE-ENTRY CONTROL", "RECOVERY"],
    quote: ["You sold.", "Then it kept pumping.", "So you bought back in."],
  },
  {
    id: "icarus", name: "ICARUS", subtitle: "TOO CLOSE TO THE SUN", artwork: "/personas/icarus.png",
    metricLabels: ["PEAK RETURN", "REALIZED RETURN", "EXIT DISCIPLINE", "ALTITUDE LOST"],
    quote: ["You were up big.", "Then you didn't sell."],
  },
  {
    id: "midas", name: "KING MIDAS", subtitle: "THE GOLDEN TOUCH", artwork: "/personas/midas.png",
    metricLabels: ["UNREALIZED PNL", "REALIZED PNL", "HOLDING POWER", "PROFIT TAKING"],
    quote: ["Everything you touch turns green.", "Except when it's time to sell."],
  },
  {
    id: "sisyphus", name: "SISYPHUS", subtitle: "BACK TO ZERO", artwork: "/personas/sisyphus.png",
    metricLabels: ["TOTAL TRADES", "TOTAL VOLUME", "NET PNL", "PROGRESS"],
    quote: ["You trade.", "You grind.", "You almost make it.", "Then you do it all again."],
  },
  {
    id: "don-quixote", name: "DON QUIXOTE", subtitle: "THE BAG BELIEVER", artwork: "/personas/don-quixote.png",
    metricLabels: ["TOKEN DOWN", "HOLDING DAYS", "AVG ENTRY", "CONVICTION"],
    quote: ["Others see a dead token.", "You see a comeback story."],
  },
  {
    id: "caesar", name: "JULIUS CAESAR", subtitle: "ALL ROADS LEAD TO ONE BAG", artwork: "/personas/caesar.png",
    metricLabels: ["LARGEST POSITION", "POSITION GROWTH", "CONVICTION", "DIVERSIFICATION"],
    quote: ["You don't diversify.", "You conquer."],
  },
  {
    id: "napoleon", name: "NAPOLEON", subtitle: "THE OVEREXTENDER", artwork: "/personas/napoleon.png",
    metricLabels: ["WIN STREAK", "RISK EXPOSURE", "LARGEST LOSS", "OVERCONFIDENCE"],
    quote: ["You win.", "You get confident.", "Then you go bigger."],
  },
  {
    id: "croesus", name: "CROESUS", subtitle: "THE WHALE KING", artwork: "/personas/croesus.png",
    metricLabels: ["WALLET SIZE", "AVG TRADE SIZE", "TOP HOLDING", "WHALE SCORE"],
    quote: ["Your wallet moves markets.", "Or at least tries to."],
  },
] as const satisfies readonly PersonaDefinition[];

export function getPersonaDefinition(id: string) {
  const displayId = id === "don_quixote" ? "don-quixote" : id;
  return personaDefinitions.find((persona) => persona.id === displayId);
}
