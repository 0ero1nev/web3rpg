import type { Fighter } from "@/types/game";
export function FighterAvatar({ fighter, size = "large", flipped = false, active = false, hit = false }: { fighter: Fighter; size?: "small" | "large"; flipped?: boolean; active?: boolean; hit?: boolean }) {
  return <div className={`fighter-avatar ${size} ${flipped ? "flipped" : ""} ${active ? "attacking" : ""} ${hit ? "hit" : ""}`} style={{ "--fighter": fighter.color } as React.CSSProperties}><div className="fighter-glow" /><div className="fighter-emoji" aria-label={`${fighter.title} fighter`}>{fighter.emoji}</div><div className="fighter-shadow" /></div>;
}
