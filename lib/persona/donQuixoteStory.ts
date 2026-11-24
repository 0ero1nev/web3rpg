import type { PositionPerformance, PositionPerformanceSummary } from "../analysis/positionPerformance";
import type { TokenLedger } from "../analysis/behaviorTypes";

export type DonQuixoteStoryData = {
  match: number;
  definingPositionId?: string;
  screens: Array<{
    id: string;
    chapter: string;
    headline: string[];
    body: string[];
    fact?: string;
    eventId?: string;
  }>;
};

/** Lowest measured return first; duration and id make ties deterministic. */
export function selectDonQuixotePosition(positions: PositionPerformance[]) {
  return positions.filter((position) =>
    position.status === "OPEN"
    && position.priceConfidence === "HIGH"
    && position.currentAmount !== null && position.currentAmount > 1e-9
    && position.unrealizedReturnPct !== null
    && Number.isFinite(position.unrealizedReturnPct)
    && position.unrealizedReturnPct >= -1 && position.unrealizedReturnPct < 0
  ).sort((a, b) =>
    a.unrealizedReturnPct! - b.unrealizedReturnPct!
    || (b.holdingDuration ?? -1) - (a.holdingDuration ?? -1)
    || a.id.localeCompare(b.id))[0];
}

export function buildDonQuixoteStoryData(input: {
  match: number;
  positionPerformance?: PositionPerformanceSummary;
  ledgers?: TokenLedger[];
}): DonQuixoteStoryData {
  const position = selectDonQuixotePosition(input.positionPerformance?.positions ?? []);
  const duration = position?.holdingDuration;
  const days = duration != null && Number.isFinite(duration) && duration >= 0
    ? Math.floor(duration / 86_400) : undefined;
  const ledger = input.ledgers?.find((item) => item.mint === position?.mint);
  const events = ledger?.events.filter((event) => event.timestamp >= position!.openedAt);
  const noSales = events?.some((event) => event.side === "BUY")
    && !events.some((event) => event.side === "SELL");
  const event = position ? { eventId: position.id } : {};
  return {
    match: input.match,
    ...(position ? { definingPositionId: position.id } : {}),
    screens: [{
      id: "believer",
      chapter: "01 / THE BELIEVER",
      headline: ["YOU TRADE LIKE", "DON QUIXOTE."],
      body: ["Some see a losing trade.", "You see a cause worth fighting for."],
    }, {
      id: "fall",
      chapter: "02 / THE FALL",
      headline: ["THE MARKET", "SAID NO."],
      ...(position ? { fact: `−${(Math.abs(position.unrealizedReturnPct!) * 100).toFixed(1)}%` } : {}),
      body: position
        ? [position.unrealizedReturnPct! <= -0.8
          ? "Your position lost almost everything." : "Your position is underwater.",
        noSales ? "You didn't sell." : "You didn't close the position."]
        : ["This position's loss could not be verified.", "No estimate replaces the missing data."],
      ...event,
    }, {
      id: "wait",
      chapter: "03 / THE WAIT",
      headline: ["AND YOU'RE", "STILL HOLDING."],
      ...(days === undefined ? {} : { fact: days === 0 ? "LESS THAN 1 DAY." : `${days} ${days === 1 ? "DAY" : "DAYS"}.` }),
      body: position && days !== undefined
        ? ["The price kept falling.", "Your conviction didn't."]
        : ["The holding duration could not be verified.", "No estimate replaces the missing data."],
      ...event,
    }, {
      id: "verdict",
      chapter: "YOUR WALLET VERDICT",
      headline: ["THE WORLD SEES WINDMILLS.", "YOU SEE GIANTS."],
      body: ["Don Quixote fought battles no one else believed in.", "You hold bags no one else believes in."],
    }],
  };
}
