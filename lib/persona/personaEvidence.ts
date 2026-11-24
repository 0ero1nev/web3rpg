import type { PersonaEvidence } from "./personaTypes";

export function clampStrength(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function evidence(
  label: string,
  value: string,
  strength: number,
): PersonaEvidence {
  return { label, value, strength: clampStrength(strength) };
}

export function formatPercent(value: number, digits = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);
}

export function formatDuration(seconds: number) {
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} hr`;
  return `${(seconds / 86_400).toFixed(1)} days`;
}
