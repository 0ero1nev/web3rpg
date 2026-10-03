import { attackMessages } from "@/game/battleMessages";
import { hashString, seededRandom } from "@/game/fighterGenerator";
import type { BattleResult, BattleRound, Fighter } from "@/types/game";

export function simulateBattle(player: Fighter, opponent: Fighter): BattleResult {
  const rng = seededRandom(hashString(`${player.wallet}::VS::${opponent.wallet}`));
  const hp = { player: player.stats.hp, opponent: opponent.stats.hp };
  const totalDamage = { player: 0, opponent: 0 };
  const fighters = { player, opponent };
  const first: "player" | "opponent" = player.stats.spd >= opponent.stats.spd ? "player" : "opponent";
  const order: ("player" | "opponent")[] = [first, first === "player" ? "opponent" : "player"];
  const rounds: BattleRound[] = []; const streak = { player: 0, opponent: 0 }; let turn = 0;
  for (let cycle = 1; cycle <= 9 && hp.player > 0 && hp.opponent > 0; cycle += 1) {
    for (const attacker of order) {
      if (hp.player <= 0 || hp.opponent <= 0) break;
      turn += 1; const defender = attacker === "player" ? "opponent" : "player"; const a = fighters[attacker]; const d = fighters[defender];
      const luck = a.stats.luck / 100; const critical = rng() < a.stats.crit / 100 + luck * 0.035;
      let multiplier = 0.84 + rng() * 0.34 + (cycle > 5 ? (cycle - 5) * 0.12 : 0); let special: string | undefined;
      if (a.class === "ASSASSIN" && turn === 1) { multiplier *= 1.4; special = "EARLY ENTRY!"; }
      else if (a.class === "MAGE" && rng() < 0.13 + luck * 0.09) { multiplier *= 2.05; special = "100X OR NOTHING — IT HIT!"; }
      else if (a.class === "WARRIOR") { streak[attacker] += 1; multiplier *= 1 + Math.min(streak[attacker] - 1, 3) * 0.12; if (streak[attacker] > 1) special = `WIN STREAK ×${streak[attacker]}`; }
      if (d.class === "PALADIN" && rng() < 0.27 + d.stats.luck / 500) { multiplier *= 0.58; special = special ? `${special} · DIAMOND HANDS` : "DIAMOND HANDS — DAMAGE REDUCED"; }
      const mitigation = 100 / (100 + d.stats.def * 0.62); let damage = a.stats.atk * 1.9 * multiplier * mitigation; if (critical) damage *= 1.65; damage = Math.max(18, Math.round(damage));
      hp[defender] = Math.max(0, hp[defender] - damage); totalDamage[attacker] += damage; const pool = attackMessages[a.class];
      rounds.push({ turn, attacker, damage, targetHp: hp[defender], critical, special, message: `${a.class} ${pool[Math.floor(rng() * pool.length)]}` });
    }
  }
  if (hp.player > 0 && hp.opponent > 0) { const loser = hp.player / player.stats.hp > hp.opponent / opponent.stats.hp ? "opponent" : "player"; const attacker = loser === "player" ? "opponent" : "player"; const damage = hp[loser]; hp[loser] = 0; totalDamage[attacker] += damage; rounds.push({ turn: ++turn, attacker, damage, targetHp: 0, critical: false, special: "MARKET CLOSE", message: `${fighters[loser].class} ran out of runway.` }); }
  const winner = hp.opponent <= 0 ? "player" : "opponent"; const mvp = [...rounds].sort((a, b) => b.damage - a.damage)[0];
  const playerScore = winner === "player" ? Math.max(2, Math.ceil(totalDamage.player / Math.max(1, player.stats.atk * 2.3))) : 1;
  const opponentScore = winner === "opponent" ? Math.max(2, Math.ceil(totalDamage.opponent / Math.max(1, opponent.stats.atk * 2.3))) : 1;
  return { player, opponent, winner, rounds, playerDamage: totalDamage.player, opponentDamage: totalDamage.opponent, mvp, score: [playerScore, opponentScore] };
}
