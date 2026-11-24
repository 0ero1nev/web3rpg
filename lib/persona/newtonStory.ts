import type { TokenLedger } from "../analysis/behaviorTypes";

export type NewtonStoryEvidenceLevel =
  | "FULL_EVIDENCE"
  | "NO_POST_EXIT_PRICE"
  | "NO_COMPARATIVE_PRICE"
  | "AGGREGATE_ONLY";

export type NewtonPostExitObservation = {
  mint: string;
  exitTimestamp: number;
  reentryTimestamp: number;
  peakTimestamp: number;
  peakPriceUsd: number;
};

export type NewtonStoryEvent = {
  id: string;
  mint: string;
  asset: string;
  verifiedSymbol?: string;
  exitTimestamp: number;
  reentryTimestamp: number;
  exitPriceUsd?: number;
  reentryPriceUsd?: number;
  postExitPeakReturn?: number;
  reentryPremium?: number;
  elapsedMs: number;
  evidenceQuality: Exclude<NewtonStoryEvidenceLevel, "AGGREGATE_ONLY">;
};

export type NewtonStoryScreenId = "exit" | "return" | "pattern" | "verdict";

export type NewtonStoryScreen = {
  id: NewtonStoryScreenId;
  chapter: string;
  eyebrow?: string;
  headline: string[];
  body: string[];
  fact?: string;
  footer?: string[];
  eventId?: string;
};

export type NewtonStoryData = {
  match: number;
  evidenceLevel: NewtonStoryEvidenceLevel;
  historyComplete: boolean;
  definingEvent?: NewtonStoryEvent;
  reentryCount: number;
  higherPriceReentryCount?: number;
  screens: NewtonStoryScreen[];
};

export type NewtonStoryFacts = {
  match: number;
  historyComplete: boolean;
  candidates: NewtonStoryEvent[];
  reentryCount: number;
  higherPriceReentryCount?: number;
};

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function safeSymbol(symbol: string | undefined, mint: string): string | undefined {
  const candidate = symbol?.trim();
  if (!candidate || candidate === mint || /^(UNKNOWN|TOKEN|N\/A)$/i.test(candidate)) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._$-]{0,11}$/.test(candidate) ? candidate.toUpperCase() : undefined;
}

function shortenMint(mint: string): string {
  const clean = mint.trim();
  if (clean.length >= 12 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(clean)) {
    return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
  }
  return "THIS TOKEN";
}

function eventId(mint: string, exitTimestamp: number, reentryTimestamp: number): string {
  return `${mint}:${exitTimestamp}:${reentryTimestamp}`;
}

function matchingObservation(
  observations: NewtonPostExitObservation[],
  mint: string,
  exitTimestamp: number,
  reentryTimestamp: number,
): NewtonPostExitObservation | undefined {
  return observations.find((observation) =>
    observation.mint === mint
    && observation.exitTimestamp === exitTimestamp
    && observation.reentryTimestamp === reentryTimestamp
    && observation.peakTimestamp > exitTimestamp
    && observation.peakTimestamp <= reentryTimestamp
    && finitePositive(observation.peakPriceUsd));
}

/** Extracts only measured/derived facts. It never produces presentation copy. */
export function extractNewtonStoryFacts(input: {
  match: number;
  historyComplete: boolean;
  ledgers: TokenLedger[];
  postExitObservations?: NewtonPostExitObservation[];
}): NewtonStoryFacts {
  const observations = input.postExitObservations ?? [];
  const candidates: NewtonStoryEvent[] = [];
  let comparableReentries = 0;
  let higherPriceReentries = 0;
  let reentryCount = 0;

  for (const ledger of input.ledgers) {
    const verifiedSymbol = safeSymbol(ledger.symbol, ledger.mint);
    for (const reentry of ledger.reentries) {
      reentryCount += 1;
      if (typeof reentry.reenteredHigher === "boolean") {
        comparableReentries += 1;
        if (reentry.reenteredHigher) higherPriceReentries += 1;
      }
      if (!Number.isFinite(reentry.exitAt) || !Number.isFinite(reentry.reentryAt) || reentry.reentryAt <= reentry.exitAt) {
        continue;
      }

      const exitPriceUsd = reentry.exitPriceUsd;
      const reentryPriceUsd = reentry.reentryPriceUsd;
      const pricesComparable = finitePositive(exitPriceUsd) && finitePositive(reentryPriceUsd);
      const reentryPremium = pricesComparable
        ? (reentryPriceUsd - exitPriceUsd) / exitPriceUsd
        : undefined;
      const observation = pricesComparable
        ? matchingObservation(observations, ledger.mint, reentry.exitAt, reentry.reentryAt)
        : undefined;
      const postExitPeakReturn = observation && finitePositive(exitPriceUsd)
        ? (observation.peakPriceUsd - exitPriceUsd) / exitPriceUsd
        : undefined;
      const hasFullEvidence = reentryPremium !== undefined
        && reentryPremium > 0
        && postExitPeakReturn !== undefined
        && postExitPeakReturn > 0;
      const hasHigherPriceReentry = reentryPremium !== undefined && reentryPremium > 0;

      candidates.push({
        id: eventId(ledger.mint, reentry.exitAt, reentry.reentryAt),
        mint: ledger.mint,
        asset: verifiedSymbol ?? shortenMint(ledger.mint),
        ...(verifiedSymbol ? { verifiedSymbol } : {}),
        exitTimestamp: reentry.exitAt,
        reentryTimestamp: reentry.reentryAt,
        ...(finitePositive(exitPriceUsd) ? { exitPriceUsd } : {}),
        ...(finitePositive(reentryPriceUsd) ? { reentryPriceUsd } : {}),
        ...(hasFullEvidence ? { postExitPeakReturn } : {}),
        ...(hasHigherPriceReentry ? { reentryPremium } : {}),
        elapsedMs: (reentry.reentryAt - reentry.exitAt) * 1_000,
        evidenceQuality: hasFullEvidence
          ? "FULL_EVIDENCE"
          : hasHigherPriceReentry
            ? "NO_POST_EXIT_PRICE"
            : "NO_COMPARATIVE_PRICE",
      });
    }
  }

  return {
    match: input.match,
    historyComplete: input.historyComplete,
    candidates,
    reentryCount,
    ...(reentryCount > 0 && comparableReentries === reentryCount
      ? { higherPriceReentryCount: higherPriceReentries }
      : {}),
  };
}

const qualityRank: Record<NewtonStoryEvent["evidenceQuality"], number> = {
  FULL_EVIDENCE: 3,
  NO_POST_EXIT_PRICE: 2,
  NO_COMPARATIVE_PRICE: 1,
};

/**
 * Deterministic narrative selector. Evidence completeness and story strength
 * lead; timestamps are only a final stable tie-breaker, never a recency rule.
 */
export function selectNewtonStoryEvent(candidates: NewtonStoryEvent[]): NewtonStoryEvent | undefined {
  return candidates.slice().sort((a, b) =>
    qualityRank[b.evidenceQuality] - qualityRank[a.evidenceQuality]
    || (b.reentryPremium ?? -Infinity) - (a.reentryPremium ?? -Infinity)
    || (b.postExitPeakReturn ?? -Infinity) - (a.postExitPeakReturn ?? -Infinity)
    || a.elapsedMs - b.elapsedMs
    || a.mint.localeCompare(b.mint)
    || a.exitTimestamp - b.exitTimestamp
    || a.reentryTimestamp - b.reentryTimestamp)[0];
}

export function formatNewtonStoryDate(timestampSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestampSeconds * 1_000)).toUpperCase();
}

export function formatNewtonElapsed(elapsedMs: number): string {
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  if (minutes < 90) return `${minutes} ${minutes === 1 ? "MINUTE" : "MINUTES"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} ${hours === 1 ? "HOUR" : "HOURS"}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "DAY" : "DAYS"}`;
}

function storyPercent(value: number): string {
  const percentage = value * 100;
  return Number.isInteger(Math.round(percentage * 10) / 10)
    ? String(Math.round(percentage))
    : percentage.toFixed(1);
}

function eventScreens(event: NewtonStoryEvent): [NewtonStoryScreen, NewtonStoryScreen] {
  const date = formatNewtonStoryDate(event.exitTimestamp);
  const elapsed = `${formatNewtonElapsed(event.elapsedMs)} LATER...`;

  if (event.evidenceQuality === "FULL_EVIDENCE") {
    return [{
      id: "exit",
      chapter: "THE MOMENT — EXIT",
      eyebrow: date,
      headline: ["YOU SOLD."],
      body: ["And for a moment,", "that looked like the right call.", "Then it kept going."],
      fact: `+${storyPercent(event.postExitPeakReturn!)}% AFTER YOU LEFT.`,
      eventId: event.id,
    }, {
      id: "return",
      chapter: "THE RETURN — RE-ENTRY",
      eyebrow: elapsed,
      headline: ["YOU CAME BACK."],
      body: [`You bought ${event.asset} again —`],
      fact: `${storyPercent(event.reentryPremium!)}% HIGHER\nTHAN WHERE YOU SOLD IT.`,
      footer: ["Sometimes the hardest position to close", "is the one in your head."],
      eventId: event.id,
    }];
  }

  if (event.evidenceQuality === "NO_POST_EXIT_PRICE") {
    return [{
      id: "exit",
      chapter: "THE MOMENT — EXIT",
      eyebrow: date,
      headline: ["YOU SOLD."],
      body: ["One moment stood out", "in the history we analyzed."],
      eventId: event.id,
    }, {
      id: "return",
      chapter: "THE RETURN — RE-ENTRY",
      eyebrow: elapsed,
      headline: ["YOU CAME BACK."],
      body: [`You bought ${event.asset} again —`],
      fact: `${storyPercent(event.reentryPremium!)}% HIGHER\nTHAN WHERE YOU SOLD IT.`,
      footer: ["Sometimes the hardest position to close", "is the one in your head."],
      eventId: event.id,
    }];
  }

  return [{
    id: "exit",
    chapter: "THE MOMENT — EXIT",
    eyebrow: date,
    headline: ["YOU LEFT", "THIS POSITION."],
    body: ["One moment stood out", "in the history we analyzed."],
    eventId: event.id,
  }, {
    id: "return",
    chapter: "THE RETURN — RE-ENTRY",
    eyebrow: elapsed,
    headline: ["THEN YOU", "CAME BACK."],
    body: [`You returned to ${event.asset}.`, "The sequence is observed.", "The price comparison is not."],
    eventId: event.id,
  }];
}

function aggregateScreens(reentryCount: number): [NewtonStoryScreen, NewtonStoryScreen] {
  return [{
    id: "exit",
    chapter: "THE MOMENT — EXIT",
    eyebrow: "IN THE HISTORY WE ANALYZED",
    headline: ["YOU FOUND", "THE EXIT."],
    body: ["No single trade had enough evidence", "to carry the whole story."],
  }, {
    id: "return",
    chapter: "THE RETURN — RE-ENTRY",
    headline: ["AND THEN", "YOU CAME BACK."],
    body: reentryCount > 0
      ? ["The pattern appeared across", "the analysis window."]
      : ["The aggregate signal was stronger", "than any single observed moment."],
    ...(reentryCount > 0 ? { fact: `${reentryCount} ${reentryCount === 1 ? "RETURN" : "RETURNS"} OBSERVED.` } : {}),
  }];
}

function patternScreen(reentryCount: number, higherPriceReentryCount?: number): NewtonStoryScreen {
  if (reentryCount <= 0) {
    return {
      id: "pattern",
      chapter: "THE PATTERN",
      headline: ["THE SIGNAL LIVED", "IN THE PATTERN."],
      body: ["In this analysis window,", "the aggregate Newton behavior stood out."],
      footer: ["The evidence says enough.", "It does not say more."],
    };
  }
  return {
    id: "pattern",
    chapter: "THE PATTERN",
    headline: ["AND IT WASN'T", "JUST ONCE."],
    body: [higherPriceReentryCount === undefined ? "You came back to positions" : "You re-entered positions"],
    fact: `${reentryCount} TIMES.`,
    footer: higherPriceReentryCount === undefined
      ? ["Apparently, goodbye", "doesn't always mean goodbye."]
      : [`${higherPriceReentryCount} of them at a higher price.`, "Apparently, goodbye", "doesn't always mean goodbye."],
  };
}

function verdictScreen(): NewtonStoryScreen {
  return {
    id: "verdict",
    chapter: "NEWTON COMPARISON + WALLET VERDICT",
    eyebrow: "NEWTON DID IT TOO.",
    headline: ["SMART ENOUGH", "TO LEAVE.", "HUMAN ENOUGH", "TO COME BACK."],
    body: [
      "Isaac Newton exited his South Sea investment profitably, watched prices continue rising, and later returned to the market before suffering major losses.",
    ],
    footer: ["YOUR WALLET VERDICT"],
  };
}

/** Turns extracted facts into deterministic copy; the React layer only presents it. */
export function buildNewtonStoryModel(facts: NewtonStoryFacts): NewtonStoryData {
  const definingEvent = selectNewtonStoryEvent(facts.candidates);
  const [exit, reentry] = definingEvent
    ? eventScreens(definingEvent)
    : aggregateScreens(facts.reentryCount);
  return {
    match: facts.match,
    evidenceLevel: definingEvent?.evidenceQuality ?? "AGGREGATE_ONLY",
    historyComplete: facts.historyComplete,
    ...(definingEvent ? { definingEvent } : {}),
    reentryCount: facts.reentryCount,
    ...(facts.higherPriceReentryCount === undefined ? {} : { higherPriceReentryCount: facts.higherPriceReentryCount }),
    screens: [
      exit,
      reentry,
      patternScreen(facts.reentryCount, facts.higherPriceReentryCount),
      verdictScreen(),
    ],
  };
}

export function buildNewtonStoryData(input: {
  match: number;
  historyComplete: boolean;
  ledgers: TokenLedger[];
  postExitObservations?: NewtonPostExitObservation[];
}): NewtonStoryData {
  return buildNewtonStoryModel(extractNewtonStoryFacts(input));
}
