export type FighterClass = "ASSASSIN" | "MAGE" | "WARRIOR" | "PALADIN";
export type FighterStats = { hp: number; atk: number; def: number; spd: number; crit: number; luck: number };
export type Fighter = { wallet: string; class: FighterClass; title: string; level: number; stats: FighterStats; signature: string; personality: string; emoji: string; color: string };
export type BattleRound = { turn: number; attacker: "player" | "opponent"; damage: number; targetHp: number; critical: boolean; special?: string; message: string };
export type BattleResult = { player: Fighter; opponent: Fighter; winner: "player" | "opponent"; rounds: BattleRound[]; playerDamage: number; opponentDamage: number; mvp: BattleRound; score: [number, number] };
