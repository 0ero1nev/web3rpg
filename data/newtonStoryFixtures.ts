import { buildNewtonStoryModel, type NewtonStoryData, type NewtonStoryEvent } from "@/lib/persona/newtonStory";

const exitTimestamp = Date.UTC(2026, 2, 14, 4, 18, 0) / 1_000;
const reentryTimestamp = exitTimestamp + 11 * 60 * 60;

function event(overrides: Partial<NewtonStoryEvent> = {}): NewtonStoryEvent {
  return {
    id: `DezXAZ8z7PnrnRJjz3wXBoRgixCa6f6Y6fG6Xx9wB1pB:${exitTimestamp}:${reentryTimestamp}`,
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6f6Y6fG6Xx9wB1pB",
    asset: "BONK",
    verifiedSymbol: "BONK",
    exitTimestamp,
    reentryTimestamp,
    exitPriceUsd: 0.00002,
    reentryPriceUsd: 0.0000244,
    postExitPeakReturn: 0.34,
    reentryPremium: 0.22,
    elapsedMs: 11 * 60 * 60 * 1_000,
    evidenceQuality: "FULL_EVIDENCE",
    ...overrides,
  };
}

export type NewtonStoryFixtureName =
  | "FULL_EVIDENCE"
  | "NO_POST_EXIT_PRICE"
  | "NO_COMPARATIVE_PRICE"
  | "AGGREGATE_ONLY";

export const NEWTON_STORY_FIXTURES: Record<NewtonStoryFixtureName, NewtonStoryData> = {
  FULL_EVIDENCE: buildNewtonStoryModel({
    match: 78,
    historyComplete: false,
    candidates: [event()],
    reentryCount: 13,
    higherPriceReentryCount: 8,
  }),
  NO_POST_EXIT_PRICE: buildNewtonStoryModel({
    match: 74,
    historyComplete: false,
    candidates: [event({ postExitPeakReturn: undefined, evidenceQuality: "NO_POST_EXIT_PRICE" })],
    reentryCount: 7,
    higherPriceReentryCount: 5,
  }),
  NO_COMPARATIVE_PRICE: buildNewtonStoryModel({
    match: 69,
    historyComplete: false,
    candidates: [event({
      asset: "DezX…wB1pB",
      verifiedSymbol: undefined,
      exitPriceUsd: undefined,
      reentryPriceUsd: undefined,
      postExitPeakReturn: undefined,
      reentryPremium: undefined,
      evidenceQuality: "NO_COMPARATIVE_PRICE",
    })],
    reentryCount: 4,
  }),
  AGGREGATE_ONLY: buildNewtonStoryModel({
    match: 66,
    historyComplete: false,
    candidates: [],
    reentryCount: 3,
  }),
};
