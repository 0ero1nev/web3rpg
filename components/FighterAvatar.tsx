/* eslint-disable @next/next/no-img-element -- one sprite sheet is intentionally cropped into eight portraits */
import type { Fighter } from "@/types/game";

const PORTRAIT_CELLS = {
  ASSASSIN: [[1, 0], [2, 1]],
  MAGE: [[0, 0], [2, 0]],
  WARRIOR: [[3, 0], [1, 1]],
  PALADIN: [[0, 1], [3, 1]],
} as const;

function portraitCell(fighter: Fighter) {
  const variant = [...fighter.wallet].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2;
  return PORTRAIT_CELLS[fighter.class][variant];
}

export function FighterAvatar({ fighter, size = "large", flipped = false, active = false, hit = false }: { fighter: Fighter; size?: "small" | "large"; flipped?: boolean; active?: boolean; hit?: boolean }) {
  const [column, row] = portraitCell(fighter);
  return <div className={`fighter-avatar ${size} ${flipped ? "flipped" : ""} ${active ? "attacking" : ""} ${hit ? "hit" : ""}`} style={{ "--fighter": fighter.color, "--portrait-column": column, "--portrait-row": row } as React.CSSProperties}>
    <div className="fighter-glow" />
    <div className="fighter-portrait" role="img" aria-label={`${fighter.title} fighter`}>
      <img src="/fighter-portraits.png" alt="" draggable={false} />
    </div>
    <div className="fighter-shadow" />
  </div>;
}
