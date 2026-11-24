"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WALLET_ANALYSIS_STAGES, type WalletAnalysisStage } from "@/lib/analysis/progress";

const STAGES: Record<WalletAnalysisStage, { floor: number; ceiling: number; message: string }> = {
  PREPARING: { floor: 5, ceiling: 9.4, message: "PREPARING WALLET..." },
  FETCHING_TRANSACTIONS: { floor: 10, ceiling: 34, message: "FETCHING TRANSACTIONS..." },
  READING_SWAPS: { floor: 35, ceiling: 47, message: "READING SWAPS..." },
  RECONSTRUCTING_POSITIONS: { floor: 48, ceiling: 61, message: "RECONSTRUCTING POSITIONS..." },
  VALUING_TRADES: { floor: 62, ceiling: 77, message: "VALUING TRADES..." },
  MATCHING_PERSONA: { floor: 78, ceiling: 93, message: "MATCHING PERSONA..." },
  PACKING_RESULT: { floor: 94, ceiling: 99, message: "PACKING YOUR RESULT..." },
  COMPLETE: { floor: 100, ceiling: 100, message: "PERSONA FOUND." },
};

const STAGE_ACTIVITY: Record<WalletAnalysisStage, string> = {
  PREPARING: "CONNECTING TO WALLET HISTORY...",
  FETCHING_TRANSACTIONS: "SCANNING TRANSACTION PAGES...",
  READING_SWAPS: "CLASSIFYING SWAP ACTIVITY...",
  RECONSTRUCTING_POSITIONS: "REBUILDING POSITION TIMELINES...",
  VALUING_TRADES: "CHECKING TRADE VALUES...",
  MATCHING_PERSONA: "COMPARING BEHAVIOR PATTERNS...",
  PACKING_RESULT: "ASSEMBLING YOUR PERSONA CARD...",
  COMPLETE: "ANALYSIS COMPLETE",
};

function shortWallet(wallet: string) {
  if (wallet.length < 12) return wallet.toUpperCase();
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function stageForPreview(progress: number): WalletAnalysisStage {
  if (progress >= 100) return "COMPLETE";
  if (progress >= 94) return "PACKING_RESULT";
  if (progress >= 78) return "MATCHING_PERSONA";
  if (progress >= 48) return "RECONSTRUCTING_POSITIONS";
  if (progress >= 35) return "READING_SWAPS";
  return "FETCHING_TRANSACTIONS";
}

export function AnalysisProgress({ wallet, stage, events, previewPercent = null, onVisualComplete }: { wallet: string; stage: WalletAnalysisStage; events: string[]; previewPercent?: number | null; onVisualComplete: () => void }) {
  const actualIndex = WALLET_ANALYSIS_STAGES.indexOf(stage);
  const [visualIndex, setVisualIndex] = useState(0);
  const [displayed, setDisplayed] = useState(5);
  const enteredAt = useRef(0);
  const completed = useRef(false);
  const [renderedEventCount, setRenderedEventCount] = useState(0);
  const eventsRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRenderedEventCount((current) => {
        const available = eventsRef.current.length;
        const backlog = available - current;
        if (backlog <= 0) return current;
        return backlog >= 5
          ? Math.max(current + 1, available - 3)
          : Math.min(available, current + 1);
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (previewPercent !== null) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (enteredAt.current === 0) enteredAt.current = now;
      const delta = Math.min(64, now - previous) / 1000;
      previous = now;
      setDisplayed((current) => {
        const visualStage = WALLET_ANALYSIS_STAGES[visualIndex];
        const config = STAGES[visualStage];
        if (visualIndex < actualIndex) return Math.min(config.ceiling, current + 78 * delta);
        if (visualStage === "COMPLETE") return Math.min(100, current + 120 * delta);
        const remaining = config.ceiling - current;
        return Math.min(config.ceiling, current + Math.max(.006, remaining * .11 * delta));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [actualIndex, previewPercent, visualIndex]);

  useEffect(() => {
    if (previewPercent !== null || visualIndex >= actualIndex) return;
    const visualStage = WALLET_ANALYSIS_STAGES[visualIndex];
    if (displayed < STAGES[visualStage].ceiling - .08) return;
    const remaining = Math.max(0, 120 - (performance.now() - enteredAt.current));
    const timer = window.setTimeout(() => {
      enteredAt.current = performance.now();
      const next = Math.min(visualIndex + 1, actualIndex);
      setDisplayed((current) => Math.max(current, STAGES[WALLET_ANALYSIS_STAGES[next]].floor));
      setVisualIndex(next);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [actualIndex, displayed, previewPercent, visualIndex]);

  useEffect(() => {
    if (previewPercent !== null || visualIndex !== WALLET_ANALYSIS_STAGES.length - 1 || displayed < 99.95 || renderedEventCount < events.length || completed.current) return;
    completed.current = true;
    onVisualComplete();
  }, [displayed, events.length, onVisualComplete, previewPercent, renderedEventCount, visualIndex]);

  const visibleProgress = previewPercent ?? displayed;
  const visibleStage = previewPercent === null ? WALLET_ANALYSIS_STAGES[visualIndex] : stageForPreview(previewPercent);
  const rounded = Math.min(100, Math.floor(visibleProgress));
  const segments = useMemo(() => Array.from({ length: 20 }, (_, index) => index < Math.round(visibleProgress / 5)), [visibleProgress]);
  const visibleEvents = events.slice(0, renderedEventCount).slice(-3);
  const feedMessages = visibleEvents.length > 0 ? visibleEvents : [STAGE_ACTIVITY[visibleStage]];

  return <section className={`wallet-analysis-progress ${visibleStage === "COMPLETE" ? "is-complete" : ""}`} role="status" aria-live="polite">
    <div className="analysis-progress__heading"><strong>ANALYZING WALLET</strong><b>{rounded}%</b></div>
    <div className="analysis-progress__track" role="progressbar" aria-label="Wallet analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded}>
      {segments.map((filled, index) => <i className={filled ? "is-filled" : ""} key={index} />)}
      <span style={{ width: `${visibleProgress}%` }} />
    </div>
    <p>{STAGES[visibleStage].message}</p>
    <div className="analysis-event-feed" aria-label="Live analysis events">
      <div className="analysis-event-feed__items" key={renderedEventCount}>
        {feedMessages.map((message, index) => {
          const active = index === feedMessages.length - 1;
          return <div className={`analysis-event-feed__item ${active ? "is-active" : "is-complete"}`} key={`${renderedEventCount - feedMessages.length + index}-${message}`}>
            <b aria-hidden="true">{active ? "→" : "✓"}</b><span>{message}</span>
          </div>;
        })}
      </div>
    </div>
    <small>{shortWallet(wallet)}</small>
  </section>;
}
