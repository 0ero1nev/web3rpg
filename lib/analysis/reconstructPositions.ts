import type { NormalizedTokenChange, NormalizedTransaction } from "./types";
import type {
  PositionReconstruction,
  ReconstructionOptions,
  ReentryEvent,
  TokenLedger,
  TradeLeg,
} from "./behaviorTypes";

export const QUOTE_ASSET_MINTS = new Set([
  "SOL",
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

const DEFAULT_ABSOLUTE_DUST = 1e-9;
const DEFAULT_RELATIVE_DUST = 1e-8;

type MutableLedger = TokenLedger & {
  averageCostUsd: number | null;
  costBasisKnown: boolean;
  activePeriodIndex?: number;
  lastExitAt?: number;
  lastExitPriceUsd?: number;
  hasClosedPosition: boolean;
  pricedSellCount: number;
  realizedPnlTotal: number;
};

function isQuoteAsset(change: NormalizedTokenChange) {
  return QUOTE_ASSET_MINTS.has(change.mint);
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function unitPrice(change: NormalizedTokenChange) {
  if (change.usdValue === undefined || !finitePositive(change.amount)) return undefined;
  return Math.abs(change.usdValue) / change.amount;
}

function createLedger(change: NormalizedTokenChange, timestamp: number): MutableLedger {
  return {
    mint: change.mint,
    symbol: change.symbol,
    firstTradeAt: timestamp,
    lastTradeAt: timestamp,
    buys: [],
    sells: [],
    totalBought: 0,
    totalSold: 0,
    currentTrackedAmount: 0,
    buyCount: 0,
    sellCount: 0,
    holdingPeriods: [],
    reentries: [],
    openingStateUnknown: false,
    trackingStateUnknown: false,
    averageCostUsd: null,
    realizedPnlUsd: { value: null, coverage: 0, sampleSize: 0 },
    events: [],
    costBasisKnown: true,
    hasClosedPosition: false,
    pricedSellCount: 0,
    realizedPnlTotal: 0,
  };
}

function makeLeg(
  transaction: NormalizedTransaction,
  change: NormalizedTokenChange,
  side: "BUY" | "SELL",
  eventType: TradeLeg["eventType"],
): TradeLeg {
  return {
    signature: transaction.signature,
    timestamp: transaction.timestamp,
    side,
    eventType,
    mint: change.mint,
    symbol: change.symbol,
    amount: change.amount,
    usdValue: change.usdValue,
    unitPriceUsd: unitPrice(change),
    counterAssets: transaction.tokenChanges
      .filter((candidate) => candidate.direction !== change.direction)
      .map((candidate) => ({ ...candidate })),
    realizedPnlUsd: null,
  };
}

function dustFor(ledger: MutableLedger, absolute: number, relative: number) {
  return Math.max(absolute, ledger.totalBought * relative);
}

function acquire(
  ledger: MutableLedger,
  transaction: NormalizedTransaction,
  change: NormalizedTokenChange,
) {
  const wasOpen = ledger.currentTrackedAmount > 0;
  const isReentry = !wasOpen && ledger.hasClosedPosition && !ledger.trackingStateUnknown;
  const eventType: TradeLeg["eventType"] = isReentry ? "RE_ENTRY" : wasOpen ? "ADD" : "BUY";
  const leg = makeLeg(transaction, change, "BUY", eventType);

  if (!wasOpen && !ledger.trackingStateUnknown) {
    ledger.holdingPeriods.push({ openedAt: transaction.timestamp, openingStateUnknown: false });
    ledger.activePeriodIndex = ledger.holdingPeriods.length - 1;
  }

  if (isReentry && ledger.lastExitAt !== undefined) {
    const reentry: ReentryEvent = {
      mint: ledger.mint,
      exitAt: ledger.lastExitAt,
      reentryAt: transaction.timestamp,
      exitPriceUsd: ledger.lastExitPriceUsd,
      reentryPriceUsd: leg.unitPriceUsd,
      timeBetweenSeconds: Math.max(0, transaction.timestamp - ledger.lastExitAt),
    };
    if (reentry.exitPriceUsd !== undefined && reentry.reentryPriceUsd !== undefined) {
      reentry.reenteredHigher = reentry.reentryPriceUsd > reentry.exitPriceUsd;
    }
    ledger.reentries.push(reentry);
  }

  const oldQuantity = ledger.currentTrackedAmount;
  const newQuantity = oldQuantity + change.amount;
  if (ledger.costBasisKnown && change.usdValue !== undefined && newQuantity > 0) {
    const oldCost = oldQuantity * (ledger.averageCostUsd ?? 0);
    ledger.averageCostUsd = (oldCost + Math.abs(change.usdValue)) / newQuantity;
  } else {
    ledger.costBasisKnown = false;
    ledger.averageCostUsd = null;
  }

  ledger.currentTrackedAmount = newQuantity;
  ledger.totalBought += change.amount;
  ledger.buyCount += 1;
  ledger.buys.push(leg);
  ledger.events.push(leg);
}

function dispose(
  ledger: MutableLedger,
  transaction: NormalizedTransaction,
  change: NormalizedTokenChange,
  historyComplete: boolean,
  absoluteDust: number,
  relativeDust: number,
) {
  const firstObservedTrade = ledger.buyCount === 0 && ledger.sellCount === 0;
  if (firstObservedTrade) {
    ledger.openingStateUnknown = !historyComplete;
    ledger.trackingStateUnknown = true;
    ledger.costBasisKnown = false;
    ledger.averageCostUsd = null;
  }

  const dust = dustFor(ledger, absoluteDust, relativeDust);
  const overdrawsTrackedPosition = !ledger.trackingStateUnknown
    && ledger.currentTrackedAmount > 0
    && change.amount > ledger.currentTrackedAmount + dust;
  if (overdrawsTrackedPosition) {
    if (ledger.activePeriodIndex !== undefined) {
      ledger.holdingPeriods.splice(ledger.activePeriodIndex, 1);
      ledger.activePeriodIndex = undefined;
    }
    ledger.trackingStateUnknown = true;
    ledger.costBasisKnown = false;
    ledger.averageCostUsd = null;
  }
  const canClose = !ledger.trackingStateUnknown
    && ledger.currentTrackedAmount > 0
    && Math.abs(change.amount - ledger.currentTrackedAmount) <= dust;
  const eventType: TradeLeg["eventType"] = canClose ? "EXIT" : "PARTIAL_SELL";
  const leg = makeLeg(transaction, change, "SELL", eventType);

  if (
    !ledger.trackingStateUnknown
    && ledger.currentTrackedAmount > 0
    && ledger.costBasisKnown
    && ledger.averageCostUsd !== null
    && change.usdValue !== undefined
    && change.amount <= ledger.currentTrackedAmount + dust
  ) {
    const disposedAmount = Math.min(change.amount, ledger.currentTrackedAmount);
    leg.realizedPnlUsd = Math.abs(change.usdValue) - disposedAmount * ledger.averageCostUsd;
    ledger.realizedPnlTotal += leg.realizedPnlUsd;
    ledger.pricedSellCount += 1;
  }

  if (overdrawsTrackedPosition) {
    ledger.currentTrackedAmount = 0;
  } else if (ledger.currentTrackedAmount > 0) {
    ledger.currentTrackedAmount = canClose
      ? 0
      : Math.max(0, ledger.currentTrackedAmount - change.amount);
  }

  if (canClose) {
    const activePeriod = ledger.activePeriodIndex === undefined
      ? undefined
      : ledger.holdingPeriods[ledger.activePeriodIndex];
    if (activePeriod) {
      activePeriod.closedAt = transaction.timestamp;
      activePeriod.durationSeconds = Math.max(0, transaction.timestamp - activePeriod.openedAt);
    }
    ledger.activePeriodIndex = undefined;
    ledger.hasClosedPosition = true;
    ledger.lastExitAt = transaction.timestamp;
    ledger.lastExitPriceUsd = leg.unitPriceUsd;
    ledger.averageCostUsd = null;
    ledger.costBasisKnown = true;
  }

  ledger.totalSold += change.amount;
  ledger.sellCount += 1;
  ledger.sells.push(leg);
  ledger.events.push(leg);
}

export function reconstructPositions(
  transactions: NormalizedTransaction[],
  options: ReconstructionOptions = {},
): PositionReconstruction {
  const historyComplete = options.historyComplete ?? false;
  const absoluteDust = options.absoluteDustThreshold ?? DEFAULT_ABSOLUTE_DUST;
  const relativeDust = options.relativeDustThreshold ?? DEFAULT_RELATIVE_DUST;
  const ledgers = new Map<string, MutableLedger>();
  const qualifyingSwaps: NormalizedTransaction[] = [];
  let ignoredSwapCount = 0;

  const swaps = transactions
    .filter((transaction) => transaction.type === "SWAP")
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp || a.signature.localeCompare(b.signature));

  for (const transaction of swaps) {
    const inbound = transaction.tokenChanges.filter((change) => change.direction === "IN" && finitePositive(change.amount));
    const outbound = transaction.tokenChanges.filter((change) => change.direction === "OUT" && finitePositive(change.amount));
    const nonQuoteInbound = inbound.filter((change) => !isQuoteAsset(change));
    const nonQuoteOutbound = outbound.filter((change) => !isQuoteAsset(change));

    if (inbound.length === 0 || outbound.length === 0 || (nonQuoteInbound.length === 0 && nonQuoteOutbound.length === 0)) {
      ignoredSwapCount += 1;
      continue;
    }
    qualifyingSwaps.push(transaction);

    for (const change of nonQuoteOutbound) {
      const ledger = ledgers.get(change.mint) ?? createLedger(change, transaction.timestamp);
      ledger.symbol ??= change.symbol;
      ledger.lastTradeAt = transaction.timestamp;
      dispose(ledger, transaction, change, historyComplete, absoluteDust, relativeDust);
      ledgers.set(change.mint, ledger);
    }
    for (const change of nonQuoteInbound) {
      const ledger = ledgers.get(change.mint) ?? createLedger(change, transaction.timestamp);
      ledger.symbol ??= change.symbol;
      ledger.lastTradeAt = transaction.timestamp;
      acquire(ledger, transaction, change);
      ledgers.set(change.mint, ledger);
    }
  }

  const finalized = [...ledgers.values()].map((ledger): TokenLedger => {
    ledger.realizedPnlUsd = {
      value: ledger.pricedSellCount > 0 ? ledger.realizedPnlTotal : null,
      coverage: ledger.sellCount > 0 ? ledger.pricedSellCount / ledger.sellCount : 0,
      sampleSize: ledger.pricedSellCount,
    };
    return {
      mint: ledger.mint,
      symbol: ledger.symbol,
      firstTradeAt: ledger.firstTradeAt,
      lastTradeAt: ledger.lastTradeAt,
      buys: ledger.buys,
      sells: ledger.sells,
      totalBought: ledger.totalBought,
      totalSold: ledger.totalSold,
      currentTrackedAmount: ledger.currentTrackedAmount,
      buyCount: ledger.buyCount,
      sellCount: ledger.sellCount,
      holdingPeriods: ledger.holdingPeriods,
      reentries: ledger.reentries,
      openingStateUnknown: ledger.openingStateUnknown,
      trackingStateUnknown: ledger.trackingStateUnknown,
      averageCostUsd: ledger.averageCostUsd,
      realizedPnlUsd: ledger.realizedPnlUsd,
      events: ledger.events,
    };
  }).sort((a, b) => b.events.length - a.events.length || a.mint.localeCompare(b.mint));

  return {
    qualifyingSwapCount: qualifyingSwaps.length,
    ignoredSwapCount,
    qualifyingSwaps,
    ledgers: finalized,
    dustRule: { absoluteThreshold: absoluteDust, relativeThreshold: relativeDust },
  };
}
