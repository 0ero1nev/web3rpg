import type { FighterClass } from "@/types/game";
export const CLASS_INFO: Record<FighterClass, { title: string; signature: string; personality: string; emoji: string; color: string; strength: string; weakness: string }> = {
  ASSASSIN: { title: "MEME ASSASSIN", signature: "EARLY ENTRY", personality: "Buys early. Sells earlier.", emoji: "🥷", color: "#ff426f", strength: "Lightning-fast entries", weakness: "Fragile risk control" },
  MAGE: { title: "DEGEN MAGE", signature: "100X OR NOTHING", personality: "High conviction. Questionable sizing.", emoji: "🧙", color: "#a875ff", strength: "Explosive upside", weakness: "Wild variance" },
  WARRIOR: { title: "ALPHA WARRIOR", signature: "WIN STREAK", personality: "Stacks wins. Ignores the noise.", emoji: "⚔️", color: "#ff9c32", strength: "Relentless momentum", weakness: "Predictable entries" },
  PALADIN: { title: "DIAMOND PALADIN", signature: "DIAMOND HANDS", personality: "Held through worse. Still holding.", emoji: "🛡️", color: "#34d9b1", strength: "Elite downside protection", weakness: "Slow to enter" },
};
