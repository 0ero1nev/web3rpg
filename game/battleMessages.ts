import type { FighterClass } from "@/types/game";
export const attackMessages: Record<FighterClass, string[]> = {
  ASSASSIN: ["sniped the opening.", "took profit before the candle closed.", "aped in at block zero."],
  MAGE: ["summoned a volatile candle.", "leveraged pure conviction.", "cast FOMO across the market."],
  WARRIOR: ["kept stacking green trades.", "bought the dip without blinking.", "pressed the winning position."],
  PALADIN: ["held through the drawdown.", "turned patience into pressure.", "refused to sell."],
};
