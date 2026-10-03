import { CLASS_INFO } from "@/game/classes";
import type { Fighter, FighterClass } from "@/types/game";

export function hashString(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
export function seededRandom(seed: number) { let state = seed || 1; return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const between = (rng: () => number, min: number, max: number) => Math.round(min + rng() * (max - min));
const classes: FighterClass[] = ["ASSASSIN", "MAGE", "WARRIOR", "PALADIN"];
function classForWallet(wallet: string, seed: number): FighterClass { const demo = wallet.toLowerCase(); if (demo.startsWith("demo-assassin")) return "ASSASSIN"; if (demo.startsWith("demo-mage")) return "MAGE"; if (demo.startsWith("demo-warrior")) return "WARRIOR"; if (demo.startsWith("demo-paladin")) return "PALADIN"; return classes[seed % classes.length]; }

export function generateFighter(wallet: string): Fighter {
  const clean = wallet.trim(); const seed = hashString(clean); const rng = seededRandom(seed); const fighterClass = classForWallet(clean, seed); const info = CLASS_INFO[fighterClass];
  const stats = {
    ASSASSIN: { hp: between(rng, 430, 650), atk: between(rng, 55, 86), def: between(rng, 20, 48), spd: between(rng, 78, 100), crit: between(rng, 28, 45), luck: between(rng, 35, 88) },
    MAGE: { hp: between(rng, 480, 760), atk: between(rng, 76, 100), def: between(rng, 20, 52), spd: between(rng, 42, 76), crit: between(rng, 30, 45), luck: between(rng, 45, 88) },
    WARRIOR: { hp: between(rng, 700, 940), atk: between(rng, 68, 94), def: between(rng, 55, 82), spd: between(rng, 38, 70), crit: between(rng, 8, 24), luck: between(rng, 28, 72) },
    PALADIN: { hp: between(rng, 820, 1000), atk: between(rng, 44, 72), def: between(rng, 76, 100), spd: between(rng, 20, 48), crit: between(rng, 5, 19), luck: between(rng, 38, 84) },
  }[fighterClass];
  return { wallet: clean, class: fighterClass, title: info.title, level: between(rng, 20, 80), stats, signature: info.signature, personality: info.personality, emoji: info.emoji, color: info.color };
}
export function shortWallet(wallet: string) { return wallet.length <= 13 ? wallet.toUpperCase() : `${wallet.slice(0, 5)}…${wallet.slice(-4)}`; }
