import type { PositionPerformance, PositionPerformanceSummary } from "../analysis/positionPerformance";
import type { TokenLedger, TradeLeg } from "../analysis/behaviorTypes";

export type IcarusStoryEvidenceLevel =
  | "FULL_POSITION_EVIDENCE"
  | "PARTIAL_POSITION_EVIDENCE"
  | "TOKEN_PRICE_EVIDENCE"
  | "NO_PRICE_EVIDENCE";

export type IcarusEvidenceSource =
  | "WALLET_TRANSACTION"
  | "EXECUTION_VALUATION"
  | "HISTORICAL_PRICE_SAMPLE"
  | "CURRENT_HOLDING_VALUATION"
  | "DERIVED_FROM_VERIFIED_FACTS";

export type IcarusFact<T> =
  | { available: true; value: T; source: IcarusEvidenceSource }
  | { available: false; reason: string };

export type IcarusStoryScreenId = "persona" | "rise" | "decision" | "fall" | "verdict";

export type IcarusStoryScreen = {
  id: IcarusStoryScreenId;
  chapter: string;
  eyebrow?: string;
  headline: string[];
  body: string[];
  fact?: string;
  footer?: string[];
  eventId?: string;
};

type TransactionFact = {
  timestamp: number;
  amount: number;
  valueUsd?: number;
  eventType: TradeLeg["eventType"];
};

type PriceRiseFact = {
  sampledPeakPriceUsd: number;
  sampledPeakTimestamp?: number;
  entryPriceUsd?: number;
  tokenPriceGain?: number;
  coverage: number;
  sampleCount: number;
};

type PeakPositionFact = {
  timestamp: number;
  quantity: number;
  costBasisUsd: number;
  valueUsd: number;
  unrealizedPnlUsd: number;
  returnPct: number;
};

type OutcomeFact = {
  kind: "REALIZED" | "UNREALIZED";
  timestamp: number;
  pnlUsd: number;
  returnPct: number;
  valueOrProceedsUsd: number;
};

export type IcarusStoryEvent = {
  id: string;
  mint: string;
  asset: string;
  historyComplete: boolean;
  acquisition: IcarusFact<TransactionFact>;
  additions: Array<IcarusFact<TransactionFact>>;
  partialSales: Array<IcarusFact<TransactionFact>>;
  fullExit: IcarusFact<TransactionFact>;
  costBasis: IcarusFact<number>;
  priceRise: IcarusFact<PriceRiseFact>;
  peakPosition: IcarusFact<PeakPositionFact>;
  outcome: IcarusFact<OutcomeFact>;
  profitGiveback: IcarusFact<number>;
  tokenDecline: IcarusFact<number>;
  selectionStrength: number;
};

export type IcarusStoryData = {
  match: number;
  evidenceLevel: IcarusStoryEvidenceLevel;
  historyComplete: boolean;
  definingEvent?: IcarusStoryEvent;
  screens: IcarusStoryScreen[];
};

export type IcarusStoryFacts = {
  match: number;
  historyComplete: boolean;
  candidates: IcarusStoryEvent[];
};

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function positive(value: number | null | undefined): value is number {
  return finite(value) && value > 0;
}

function available<T>(value: T, source: IcarusEvidenceSource): IcarusFact<T> {
  return { available: true, value, source };
}

function unavailable<T>(reason: string): IcarusFact<T> {
  return { available: false, reason };
}

function safeSymbol(symbol: string | undefined, mint: string): string {
  const candidate = symbol?.trim();
  if (candidate && candidate !== mint && !/^(UNKNOWN|TOKEN|N\/A)$/i.test(candidate)
    && /^[A-Za-z0-9][A-Za-z0-9._$-]{0,11}$/.test(candidate)) {
    return candidate.toUpperCase();
  }
  return mint.length >= 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : "THIS TOKEN";
}

function episodeEvents(position: PositionPerformance, ledgers: TokenLedger[]): TradeLeg[] | null {
  const ledger = ledgers.find((item) => item.mint === position.mint);
  if (!ledger) return null;
  const start = ledger.events.findIndex((event) =>
    event.timestamp === position.openedAt
    && (event.eventType === "BUY" || event.eventType === "RE_ENTRY")
  );
  if (start < 0) return null;
  if (position.closedAt === null) return ledger.events.slice(start);
  const relativeEnd = ledger.events.slice(start).findIndex((event) =>
    event.timestamp === position.closedAt && event.eventType === "EXIT"
  );
  return relativeEnd < 0 ? null : ledger.events.slice(start, start + relativeEnd + 1);
}

function transactionFact(event: TradeLeg): IcarusFact<TransactionFact> {
  return available({
    timestamp: event.timestamp,
    amount: event.amount,
    ...(finite(event.usdValue) ? { valueUsd: Math.abs(event.usdValue) } : {}),
    eventType: event.eventType,
  }, "WALLET_TRANSACTION");
}

type RunningPosition = {
  quantity: number;
  costBasisUsd: number;
  realizedPnlUsd: number;
  complete: boolean;
};

/** Average-cost chronology used only to decide which Story facts are supportable. */
function reconstructThrough(events: TradeLeg[], timestamp: number): RunningPosition {
  let quantity = 0;
  let costBasisUsd = 0;
  let realizedPnlUsd = 0;
  let complete = true;
  for (const event of events.slice().sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature))) {
    if (event.timestamp > timestamp) break;
    if (!positive(event.amount) || !finite(event.usdValue)) {
      complete = false;
      continue;
    }
    const valueUsd = Math.abs(event.usdValue);
    if (event.side === "BUY") {
      quantity += event.amount;
      costBasisUsd += valueUsd;
      continue;
    }
    if (quantity <= 0 || event.amount > quantity + 1e-9) {
      complete = false;
      continue;
    }
    const disposedCost = (costBasisUsd / quantity) * event.amount;
    quantity = Math.max(0, quantity - event.amount);
    costBasisUsd = Math.max(0, costBasisUsd - disposedCost);
    realizedPnlUsd += valueUsd - disposedCost;
  }
  return { quantity, costBasisUsd, realizedPnlUsd, complete };
}

function priceRiseFact(position: PositionPerformance, events: TradeLeg[] | null): IcarusFact<PriceRiseFact> {
  if (!positive(position.peakPriceUsd)
    || position.priceCoverage < 0.75
    || position.peakConfidence === "LOW") {
    return unavailable("No sufficiently covered sampled price rise is available.");
  }
  const acquisitionPrice = events
    ?.find((event) => event.eventType === "BUY" || event.eventType === "RE_ENTRY")
    ?.unitPriceUsd;
  const additions = events?.filter((event) => event.eventType === "ADD") ?? [];
  const aggregateEntryIsChronologicallySafe = additions.length === 0
    || (finite(position.peakTimestamp) && additions.every((event) => event.timestamp <= position.peakTimestamp!));
  const entryPriceUsd = positive(acquisitionPrice)
    ? acquisitionPrice
    : aggregateEntryIsChronologicallySafe && positive(position.entryPriceUsd)
      ? position.entryPriceUsd
      : null;
  const tokenPriceGain = positive(entryPriceUsd)
    ? position.peakPriceUsd / entryPriceUsd - 1
    : undefined;
  return available({
    sampledPeakPriceUsd: position.peakPriceUsd,
    ...(finite(position.peakTimestamp) ? { sampledPeakTimestamp: position.peakTimestamp } : {}),
    ...(positive(entryPriceUsd) ? { entryPriceUsd } : {}),
    ...(tokenPriceGain !== undefined && tokenPriceGain > 0 ? { tokenPriceGain } : {}),
    coverage: position.priceCoverage,
    sampleCount: position.sampleCount,
  }, "HISTORICAL_PRICE_SAMPLE");
}

function peakPositionFact(
  priceRise: IcarusFact<PriceRiseFact>,
  events: TradeLeg[] | null,
): IcarusFact<PeakPositionFact> {
  if (!priceRise.available || priceRise.value.sampledPeakTimestamp === undefined) {
    return unavailable("The sampled peak timestamp is unavailable.");
  }
  if (!events) return unavailable("The position transaction chronology is unavailable.");
  const state = reconstructThrough(events, priceRise.value.sampledPeakTimestamp);
  if (!state.complete || !positive(state.quantity) || !positive(state.costBasisUsd)) {
    return unavailable("Peak-time quantity or cost basis is incomplete.");
  }
  const valueUsd = state.quantity * priceRise.value.sampledPeakPriceUsd;
  const unrealizedPnlUsd = valueUsd - state.costBasisUsd;
  return available({
    timestamp: priceRise.value.sampledPeakTimestamp,
    quantity: state.quantity,
    costBasisUsd: state.costBasisUsd,
    valueUsd,
    unrealizedPnlUsd,
    returnPct: valueUsd / state.costBasisUsd - 1,
  }, "DERIVED_FROM_VERIFIED_FACTS");
}

function outcomeFact(
  position: PositionPerformance,
  events: TradeLeg[] | null,
): IcarusFact<OutcomeFact> {
  const timestamp = position.outcomeTimestamp ?? position.closedAt;
  if (!finite(timestamp)) return unavailable("The outcome timestamp is unavailable.");
  if (position.status === "CLOSED") {
    if (!positive(position.entryValueUsd) || !finite(position.exitValueUsd)) {
      return unavailable("Complete acquisition cost or exit proceeds are unavailable.");
    }
    const pnlUsd = position.exitValueUsd - position.entryValueUsd;
    return available({
      kind: "REALIZED",
      timestamp,
      pnlUsd,
      returnPct: pnlUsd / position.entryValueUsd,
      valueOrProceedsUsd: position.exitValueUsd,
    }, "EXECUTION_VALUATION");
  }
  if (!events || !finite(position.currentValueUsd)) {
    return unavailable("Current position value or transaction chronology is unavailable.");
  }
  const state = reconstructThrough(events, timestamp);
  if (!state.complete || !positive(state.costBasisUsd)) {
    return unavailable("Remaining position cost basis is unavailable.");
  }
  const pnlUsd = position.currentValueUsd - state.costBasisUsd;
  return available({
    kind: "UNREALIZED",
    timestamp,
    pnlUsd,
    returnPct: pnlUsd / state.costBasisUsd,
    valueOrProceedsUsd: position.currentValueUsd,
  }, "CURRENT_HOLDING_VALUATION");
}

function profitGivebackFact(
  peakPosition: IcarusFact<PeakPositionFact>,
  outcome: IcarusFact<OutcomeFact>,
  events: TradeLeg[] | null,
): IcarusFact<number> {
  if (!peakPosition.available || !outcome.available || !events || peakPosition.value.unrealizedPnlUsd <= 0) {
    return unavailable("Peak position profit and final outcome are not both verified.");
  }
  const additionsAfterPeak = events.some((event) =>
    event.eventType === "ADD" && event.timestamp > peakPosition.value.timestamp
  );
  const partialSalesBeforePeak = events.some((event) =>
    event.eventType === "PARTIAL_SELL" && event.timestamp <= peakPosition.value.timestamp
  );
  const anyPartialSales = events.some((event) => event.eventType === "PARTIAL_SELL");
  if (additionsAfterPeak || partialSalesBeforePeak || (outcome.value.kind === "UNREALIZED" && anyPartialSales)) {
    return unavailable("Later capital changes make peak-profit giveback non-comparable.");
  }
  const giveback = (peakPosition.value.unrealizedPnlUsd - outcome.value.pnlUsd)
    / peakPosition.value.unrealizedPnlUsd;
  return Number.isFinite(giveback)
    ? available(giveback, "DERIVED_FROM_VERIFIED_FACTS")
    : unavailable("Profit giveback could not be calculated.");
}

function eventFromPosition(
  position: PositionPerformance,
  historyComplete: boolean,
  ledgers: TokenLedger[],
): IcarusStoryEvent | null {
  const events = episodeEvents(position, ledgers);
  const acquisitionEvent = events?.find((event) => event.eventType === "BUY" || event.eventType === "RE_ENTRY");
  const additions = events?.filter((event) => event.eventType === "ADD").map(transactionFact) ?? [];
  const partialSales = events?.filter((event) => event.eventType === "PARTIAL_SELL").map(transactionFact) ?? [];
  const exitEvent = events?.findLast((event) => event.eventType === "EXIT");
  const rise = priceRiseFact(position, events);
  const peakPosition = peakPositionFact(rise, events);
  const outcome = outcomeFact(position, events);
  const profitGiveback = profitGivebackFact(peakPosition, outcome, events);
  const finalPrice = position.status === "CLOSED" ? position.exitPriceUsd : position.currentPriceUsd;
  const tokenDecline = rise.available && positive(finalPrice)
    ? available((rise.value.sampledPeakPriceUsd - finalPrice) / rise.value.sampledPeakPriceUsd, "DERIVED_FROM_VERIFIED_FACTS")
    : unavailable<number>("A comparable final token price is unavailable.");
  const hasIcarusPricePattern = positive(position.entryPriceUsd)
    && positive(position.peakPriceUsd)
    && finite(position.peakReturnPct)
    && position.peakReturnPct >= 1
    && finite(position.givebackPct)
    && position.givebackPct >= 0.5
    && position.priceCoverage >= 0.75
    && position.peakConfidence !== "LOW";
  if (!hasIcarusPricePattern) return null;
  return {
    id: position.id,
    mint: position.mint,
    asset: safeSymbol(position.symbol, position.mint),
    historyComplete,
    acquisition: acquisitionEvent
      ? transactionFact(acquisitionEvent)
      : unavailable("No verified acquisition event is attached to this episode."),
    additions,
    partialSales,
    fullExit: exitEvent
      ? transactionFact(exitEvent)
      : unavailable("No full exit was observed."),
    costBasis: positive(position.entryValueUsd)
      ? available(position.entryValueUsd, "EXECUTION_VALUATION")
      : unavailable("Complete position cost basis is unavailable."),
    priceRise: rise,
    peakPosition,
    outcome,
    profitGiveback,
    tokenDecline,
    selectionStrength: (position.peakReturnPct ?? 0) * Math.max(0, position.givebackPct ?? 0),
  };
}

/** Extracts each Story fact independently; missing facts do not erase verified ones. */
export function extractIcarusStoryFacts(input: {
  match: number;
  historyComplete: boolean;
  positionPerformance?: PositionPerformanceSummary;
  ledgers: TokenLedger[];
}): IcarusStoryFacts {
  const candidates = (input.positionPerformance?.positions ?? [])
    .flatMap((position) => {
      const event = eventFromPosition(position, input.historyComplete, input.ledgers);
      return event ? [event] : [];
    });
  return { match: input.match, historyComplete: input.historyComplete, candidates };
}

/** Matches the scoring selector's rise × giveback ordering, with stable tie-breakers. */
export function selectIcarusStoryEvent(candidates: IcarusStoryEvent[]): IcarusStoryEvent | undefined {
  return candidates.slice().sort((left, right) =>
    right.selectionStrength - left.selectionStrength
    || left.mint.localeCompare(right.mint)
    || left.id.localeCompare(right.id))[0];
}

export function formatIcarusStoryDate(timestampSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestampSeconds * 1_000)).toUpperCase();
}

function storyPercent(value: number): string {
  const percentage = value * 100;
  return Number.isInteger(Math.round(percentage * 10) / 10)
    ? String(Math.round(percentage))
    : percentage.toFixed(1);
}

function tokenPrice(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 10 })}`;
}

function compactUsd(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(absolute / 1_000_000).toFixed(2)}M`;
  if (absolute >= 10_000) return `$${(absolute / 1_000).toFixed(1)}K`;
  return `$${absolute.toFixed(2)}`;
}

function signedUsd(value: number): string {
  return `${value >= 0 ? "+" : "-"}${compactUsd(value)}`;
}

function personaScreen(match: number): IcarusStoryScreen {
  return {
    id: "persona",
    chapter: "THE PERSONA",
    headline: ["YOU TRADE LIKE ICARUS."],
    body: ["You knew how to fly.", "You just didn't know when to land."],
    fact: `${Math.round(match)}% MATCH`,
  };
}

function riseScreen(event: IcarusStoryEvent): IcarusStoryScreen {
  if (!event.priceRise.available) {
    return {
      id: "rise",
      chapter: "THE RISE — EVIDENCE LIMITED",
      headline: ["THE RISE ISN'T", "VERIFIED."],
      body: ["Reliable historical price samples", "were not available for this position."],
      eventId: event.id,
    };
  }
  const date = event.priceRise.value.sampledPeakTimestamp === undefined
    ? "SAMPLED PEAK DATE UNAVAILABLE"
    : formatIcarusStoryDate(event.priceRise.value.sampledPeakTimestamp);
  if (event.peakPosition.available) {
    return {
      id: "rise",
      chapter: "THE RISE",
      eyebrow: date,
      headline: ["YOU WERE FLYING."],
      body: ["Your position was up"],
      fact: `${storyPercent(event.peakPosition.value.returnPct)}%`,
      footer: ["At the highest verified sampled price.", "Not an all-time-high claim."],
      eventId: event.id,
    };
  }
  if (event.priceRise.value.tokenPriceGain !== undefined) return {
    id: "rise",
    chapter: "THE RISE",
    eyebrow: date,
    headline: ["THE TOKEN", "TOOK OFF."],
    body: [`${event.asset} rose from the observed entry price`],
    fact: `${storyPercent(event.priceRise.value.tokenPriceGain)}%`,
    footer: ["This is token price movement,", "not a claim about your position PnL."],
    eventId: event.id,
  };
  return {
    id: "rise",
    chapter: "THE RISE — PRICE SAMPLE",
    eyebrow: date,
    headline: ["A VERIFIED SAMPLE", "REACHED"],
    body: [`${event.asset} was observed at`],
    fact: tokenPrice(event.priceRise.value.sampledPeakPriceUsd),
    footer: ["No chronologically comparable entry price", "is available, so no gain is claimed."],
    eventId: event.id,
  };
}

function decisionScreen(event: IcarusStoryEvent): IcarusStoryScreen {
  const peakTimestamp = event.priceRise.available ? event.priceRise.value.sampledPeakTimestamp : undefined;
  const verifiedAdditions = event.additions.filter((fact) => fact.available);
  if (verifiedAdditions.length > 0) {
    const beforePeak = peakTimestamp === undefined
      ? []
      : verifiedAdditions.filter((fact) => fact.available && fact.value.timestamp <= peakTimestamp);
    const chosen = (beforePeak.at(-1) ?? verifiedAdditions[0]);
    if (chosen.available) {
      const relation = peakTimestamp === undefined
        ? "The sampled peak time is unavailable, so the order is not assumed."
        : chosen.value.timestamp <= peakTimestamp
          ? "This addition happened before the sampled peak."
          : "This addition happened after the sampled peak.";
      return {
        id: "decision",
        chapter: "THE DECISION — ADDITION",
        eyebrow: formatIcarusStoryDate(chosen.value.timestamp),
        headline: ["YOU BOUGHT MORE."],
        body: [relation],
        ...(finite(chosen.value.valueUsd) ? { fact: compactUsd(chosen.value.valueUsd) } : {}),
        eventId: event.id,
      };
    }
  }
  const verifiedPartialSale = event.partialSales.find((fact) => fact.available);
  if (verifiedPartialSale?.available) {
    return {
      id: "decision",
      chapter: "THE DECISION — PARTIAL SALE",
      eyebrow: formatIcarusStoryDate(verifiedPartialSale.value.timestamp),
      headline: ["YOU TOOK", "SOME OFF."],
      body: [peakTimestamp === undefined
        ? "The sale is verified; its order relative to the sampled peak is not."
        : verifiedPartialSale.value.timestamp <= peakTimestamp
          ? "You reduced the position before the sampled peak."
          : "You reduced the position after the sampled peak."],
      ...(finite(verifiedPartialSale.value.valueUsd) ? { fact: compactUsd(verifiedPartialSale.value.valueUsd) } : {}),
      eventId: event.id,
    };
  }
  if (event.peakPosition.available) {
    return {
      id: "decision",
      chapter: "THE DECISION",
      headline: ["YOU DIDN'T SELL."],
      body: ["The reconstructed position remained open", "through the sampled price peak."],
      eventId: event.id,
    };
  }
  if (event.acquisition.available) {
    return {
      id: "decision",
      chapter: "THE DECISION — VERIFIED PURCHASE",
      eyebrow: formatIcarusStoryDate(event.acquisition.value.timestamp),
      headline: [event.acquisition.value.eventType === "RE_ENTRY" ? "YOU CAME BACK." : "YOU BOUGHT IN."],
      body: ["The purchase is verified.", "Peak-time position quantity is not."],
      ...(finite(event.acquisition.value.valueUsd) ? { fact: compactUsd(event.acquisition.value.valueUsd) } : {}),
      eventId: event.id,
    };
  }
  return {
    id: "decision",
    chapter: "THE DECISION — EVIDENCE LIMITED",
    headline: ["WE WON'T", "GUESS."],
    body: ["No purchase or holding decision", "is shown without a verified transaction."],
    eventId: event.id,
  };
}

function outcomeLine(outcome: OutcomeFact): string {
  return `${outcome.kind} RESULT: ${signedUsd(outcome.pnlUsd)} (${outcome.returnPct >= 0 ? "+" : ""}${storyPercent(outcome.returnPct)}%)`;
}

function fallScreen(event: IcarusStoryEvent): IcarusStoryScreen {
  const date = event.outcome.available ? formatIcarusStoryDate(event.outcome.value.timestamp) : undefined;
  if (event.profitGiveback.available) {
    return {
      id: "fall",
      chapter: "THE FALL",
      ...(date ? { eyebrow: date } : {}),
      headline: ["THEN YOU FELL."],
      body: ["Verified peak unrealized profit given back"],
      fact: `${storyPercent(event.profitGiveback.value)}%`,
      footer: event.outcome.available
        ? [outcomeLine(event.outcome.value), "The hardest part?", "You were already winning."]
        : ["The hardest part?", "You were already winning."],
      eventId: event.id,
    };
  }
  if (event.tokenDecline.available) {
    return {
      id: "fall",
      chapter: "THE FALL",
      ...(date ? { eyebrow: date } : {}),
      headline: ["THEN THE TOKEN FELL."],
      body: ["From the highest verified sampled price"],
      fact: `${storyPercent(event.tokenDecline.value)}%`,
      footer: event.outcome.available
        ? [outcomeLine(event.outcome.value), "Token decline and wallet PnL", "are reported separately."]
        : ["Your financial outcome is unknown.", "No realized loss is implied."],
      eventId: event.id,
    };
  }
  return {
    id: "fall",
    chapter: "THE FALL — EVIDENCE LIMITED",
    ...(date ? { eyebrow: date } : {}),
    headline: ["THE OUTCOME", "STAYS HONEST."],
    body: ["No decline or profit giveback", "is shown without comparable evidence."],
    ...(event.outcome.available ? { footer: [outcomeLine(event.outcome.value)] } : {}),
    eventId: event.id,
  };
}

function verdictScreen(): IcarusStoryScreen {
  return {
    id: "verdict",
    chapter: "ICARUS COMPARISON + WALLET VERDICT",
    body: ["ICARUS FLEW TOO CLOSE TO THE SUN.", "YOU FLEW TOO CLOSE TO THE GREEN CANDLES."],
    headline: ["THE FALL WAS REAL.", "SO WAS THE HIGH."],
    footer: ["YOUR WALLET VERDICT"],
  };
}

function noEventScreens(): [IcarusStoryScreen, IcarusStoryScreen, IcarusStoryScreen] {
  return [{
    id: "rise",
    chapter: "THE RISE — EVIDENCE LIMITED",
    headline: ["NO RELIABLE", "PRICE SAMPLES."],
    body: ["The Icarus assignment remains unchanged.", "The Story does not invent a rise."],
  }, {
    id: "decision",
    chapter: "THE DECISION — EVIDENCE LIMITED",
    headline: ["NO VERIFIED", "MOMENT."],
    body: ["A transaction-level decision", "could not be tied to sampled prices."],
  }, {
    id: "fall",
    chapter: "THE FALL — EVIDENCE LIMITED",
    headline: ["NO FICTIONAL", "FALL."],
    body: ["No date, return, PnL,", "or giveback is filled in."],
  }];
}

function evidenceLevel(event: IcarusStoryEvent | undefined): IcarusStoryEvidenceLevel {
  if (!event || !event.priceRise.available) return "NO_PRICE_EVIDENCE";
  if (event.peakPosition.available && event.outcome.available && event.profitGiveback.available) {
    return "FULL_POSITION_EVIDENCE";
  }
  if (event.peakPosition.available || event.outcome.available || event.costBasis.available) {
    return "PARTIAL_POSITION_EVIDENCE";
  }
  return "TOKEN_PRICE_EVIDENCE";
}

/** Converts independently audited facts into the strongest truthful five-screen copy. */
export function buildIcarusStoryModel(facts: IcarusStoryFacts): IcarusStoryData {
  const definingEvent = selectIcarusStoryEvent(facts.candidates);
  const middle = definingEvent
    ? [riseScreen(definingEvent), decisionScreen(definingEvent), fallScreen(definingEvent)] as const
    : noEventScreens();
  return {
    match: facts.match,
    evidenceLevel: evidenceLevel(definingEvent),
    historyComplete: facts.historyComplete,
    ...(definingEvent ? { definingEvent } : {}),
    screens: [personaScreen(facts.match), ...middle, verdictScreen()],
  };
}

export function buildIcarusStoryData(input: {
  match: number;
  historyComplete: boolean;
  positionPerformance?: PositionPerformanceSummary;
  ledgers: TokenLedger[];
}): IcarusStoryData {
  return buildIcarusStoryModel(extractIcarusStoryFacts(input));
}
