type MetricGlyph = "trades" | "volume" | "pnl" | "progress" | "timing" | "fomo" | "reentry" | "recovery" | "holding" | "conviction" | "risk" | "loss" | "whale";

function glyphFor(label: string): MetricGlyph {
  const value = label.toUpperCase();
  if (value.includes("TRADE") || value.includes("POSITION")) return "trades";
  if (value.includes("VOLUME") || value.includes("SIZE")) return "volume";
  if (value.includes("PNL") || value.includes("RETURN") || value.includes("PROFIT")) return "pnl";
  if (value.includes("PROGRESS") || value.includes("GROWTH")) return "progress";
  if (value.includes("TIMING") || value.includes("DAYS")) return "timing";
  if (value.includes("FOMO") || value.includes("ALTITUDE")) return "fomo";
  if (value.includes("RE-ENTRY") || value.includes("DIVERSIFICATION")) return "reentry";
  if (value.includes("RECOVERY")) return "recovery";
  if (value.includes("HOLDING") || value.includes("HOLD")) return "holding";
  if (value.includes("CONVICTION") || value.includes("DISCIPLINE")) return "conviction";
  if (value.includes("RISK") || value.includes("EXPOSURE")) return "risk";
  if (value.includes("LOSS") || value.includes("DOWN")) return "loss";
  if (value.includes("WHALE") || value.includes("IMPACT")) return "whale";
  return "progress";
}

function MetricGlyphShape({ glyph }: { glyph: MetricGlyph }) {
  switch (glyph) {
    case "trades": return <><path d="M7 8h10M7 12h7M7 16h10" /><path d="m14 5 3 3-3 3" /></>;
    case "volume": return <><path d="M6 17V9M10 17V6M14 17v-5M18 17V8" /><path d="M5 18h14" /></>;
    case "pnl": return <><path d="M6 16 10 11l3 2 5-7" /><path d="M14 6h4v4" /></>;
    case "progress": return <><path d="M6 17 11 12l3 2 4-6" /><path d="M14 8h4v4" /></>;
    case "timing": return <><circle cx="12" cy="12" r="6" /><path d="M12 8v4l3 2" /></>;
    case "fomo": return <><path d="m12 5 4 6-4 8-4-8Z" /><path d="M12 9v4" /></>;
    case "reentry": return <><path d="M17 9a6 6 0 1 0 1 6" /><path d="m14 6 3 3-4 1M18 15l-3 3" /></>;
    case "recovery": return <><path d="M6 16h3l2-7 3 6 2-4h2" /><path d="m15 8 3 3-3 3" /></>;
    case "holding": return <><path d="M8 18V9M11 18V6M14 18V8M17 18v-7" /><path d="M6 13c0 4 2 6 6 6s6-2 6-6" /></>;
    case "conviction": return <><path d="m12 5 6 3v4c0 4-2 6-6 8-4-2-6-4-6-8V8Z" /><path d="m9 12 2 2 4-4" /></>;
    case "risk": return <><path d="m12 5 7 13H5Z" /><path d="M12 9v4M12 16h.01" /></>;
    case "loss": return <><path d="M6 7 10 11l3-2 5 7" /><path d="M14 16h4v-4" /></>;
    case "whale": return <><path d="M6 13c1 4 4 6 8 5 3-1 4-3 4-6-2 1-3 0-4-2-2 3-5 4-8 3Z" /><path d="M7 11 5 8M15 8c1-2 2-2 3-1" /></>;
  }
}

export function PersonaMetricIcon({ label }: { label: string }) {
  return <span className="persona-metric-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <polygon className="persona-metric-icon__face" points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7" />
      <g className="persona-metric-icon__glyph" transform="translate(12 12) scale(.78) translate(-12 -12)">
        <MetricGlyphShape glyph={glyphFor(label)} />
      </g>
    </svg>
  </span>;
}
