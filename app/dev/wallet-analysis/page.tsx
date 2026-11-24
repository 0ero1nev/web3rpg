"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  WalletAnalysisErrorResponse,
  WalletProfile,
} from "@/lib/analysis/types";
import type { DerivedMetric } from "@/lib/analysis/behaviorTypes";
import { buildWalletBehaviorProfile } from "@/lib/analysis/behaviorFeatures";
import { scorePersonas } from "@/lib/persona/personaScoring";
import styles from "./wallet-analysis.module.css";

const EXAMPLE_WALLET = "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY";

function formatUsd(value?: number | null) {
  return value === undefined || value === null
    ? "UNKNOWN"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatAge(timestamp?: number) {
  if (timestamp === undefined) return "UNKNOWN";
  const days = Math.max(0, Math.floor((Date.now() - timestamp * 1000) / 86_400_000));
  if (days < 30) return `${days} DAYS`;
  if (days < 365) return `${Math.floor(days / 30)} MONTHS`;
  return `${(days / 365.25).toFixed(1)} YEARS`;
}

function formatMetric(metric: DerivedMetric<number>, formatter: (value: number) => string) {
  return metric.value === null ? "UNKNOWN" : formatter(metric.value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDuration(value: number) {
  if (value < 3_600) return `${Math.round(value / 60)} MIN`;
  if (value < 86_400) return `${(value / 3_600).toFixed(1)} HOURS`;
  return `${(value / 86_400).toFixed(1)} DAYS`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function formatNullablePercent(value: number | null) {
  return value === null ? "UNKNOWN" : formatPercent(value);
}

export default function WalletAnalysisPage() {
  const [address, setAddress] = useState("");
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<WalletAnalysisErrorResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const counts = useMemo(() => ({
    swaps: profile?.transactions.filter((transaction) => transaction.type === "SWAP").length ?? 0,
    transfers: profile?.transactions.filter((transaction) => transaction.type === "TRANSFER").length ?? 0,
  }), [profile]);
  const behavior = useMemo(() => profile
    ? buildWalletBehaviorProfile(profile.transactions, { historyComplete: profile.dataQuality.historyComplete })
    : null, [profile]);
  const personas = useMemo(() => behavior && profile
    ? profile.personaRanking
      ?? scorePersonas(behavior, { historyComplete: profile.dataQuality.historyComplete })
    : null, [behavior, profile]);
  const valuedSwaps = useMemo(() => profile?.transactions
    .filter((transaction) => transaction.type === "SWAP" && transaction.valuation)
    ?? [], [profile]);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setProfile(null);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch("/api/analyze-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const result = await response.json() as WalletProfile | WalletAnalysisErrorResponse;

      if ("code" in result) {
        if (result.code === "PARTIAL_HISTORY" && result.profile) {
          setProfile(result.profile);
          setWarning(`${result.code}: ${result.message}`);
        } else {
          setError(result);
        }
      } else {
        setProfile(result);
      }
    } catch {
      setError({ code: "PROVIDER_ERROR", message: "The analysis endpoint could not be reached." });
    } finally {
      setLoading(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p>PHASE 1–4A · DEVELOPMENT TOOL</p>
        <h1>WALLET ANALYSIS</h1>
        <span>Read-only Solana normalization, historical USD valuation, and deterministic behavior reconstruction. No connection or signature required.</span>
      </div>
      <div className={styles.status}><i /> SERVER-SIDE HELIUS</div>
    </header>

    <form className={styles.form} onSubmit={analyze}>
      <label>
        <span>SOLANA PUBLIC KEY</span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={EXAMPLE_WALLET}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="submit" disabled={loading || !address}>
        {loading ? "ANALYZING…" : "ANALYZE"}
      </button>
    </form>

    {error && <section className={styles.error} role="alert">
      <strong>{error.code}</strong>
      <span>{error.message}</span>
    </section>}
    {warning && <section className={styles.warning} role="status">{warning}</section>}

    {profile && <>
      <section className={styles.metrics} aria-label="Wallet profile summary">
        <article><span>WALLET VALUE · PRICED</span><strong>{formatUsd(profile.walletValueUsd)}</strong></article>
        <article><span>TRANSACTIONS ANALYZED</span><strong>{profile.analyzedTransactionCount.toLocaleString()}</strong></article>
        <article><span>WALLET AGE</span><strong>{formatAge(profile.firstActivityAt)}</strong></article>
        <article><span>TOKEN HOLDINGS</span><strong>{profile.holdings.length.toLocaleString()}</strong></article>
        <article><span>DETECTED SWAPS</span><strong>{counts.swaps.toLocaleString()}</strong></article>
        <article><span>TRANSFERS</span><strong>{counts.transfers.toLocaleString()}</strong></article>
        <article><span>PRICING COVERAGE</span><strong>{Math.round(profile.dataQuality.pricingCoverage * 100)}%</strong></article>
        <article data-confidence={profile.dataQuality.confidence}><span>CONFIDENCE</span><strong>{profile.dataQuality.confidence}</strong></article>
      </section>

      <section className={styles.holdings}>
        <div className={styles.sectionTitle}>
          <h2>TOKEN HOLDINGS</h2>
          <span>{profile.dataQuality.historyComplete ? "COMPLETE HISTORY" : "PARTIAL HISTORY"}</span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>TOKEN</th><th>MINT</th><th>AMOUNT</th><th>USD VALUE</th></tr></thead>
            <tbody>{profile.holdings.map((holding) => <tr key={holding.mint}>
              <td>{holding.symbol ?? "—"}</td>
              <td title={holding.mint}>{holding.mint}</td>
              <td>{holding.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
              <td>{formatUsd(holding.usdValue)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {behavior && <>
        <section className={styles.profilePanel}>
          <div className={styles.sectionTitle}>
            <h2>VALUATION COVERAGE</h2>
            <span>QUALIFYING SWAP DENOMINATOR</span>
          </div>
          <div className={styles.behaviorMetrics}>
            <article><span>VALUED SWAPS</span><strong>{profile.valuationSummary?.valuedSwapCount ?? 0}</strong></article>
            <article><span>VALUATION COVERAGE</span><strong>{formatPercent(profile.valuationSummary?.swapValuationCoverage ?? 0)}</strong></article>
            <article><span>VOLUME COVERAGE</span><strong>{formatPercent(behavior.features.totalVolumeUsd.coverage)}</strong></article>
            <article><span>PNL COVERAGE</span><strong>{formatPercent(behavior.features.realizedPnlUsd.coverage)}</strong></article>
          </div>
        </section>

        <section className={styles.profilePanel}>
          <div className={styles.sectionTitle}>
            <h2>BEHAVIOR PROFILE</h2>
            <span>SWAPS ONLY · DETERMINISTIC</span>
          </div>
          <div className={styles.behaviorMetrics}>
            <article><span>QUALIFYING SWAPS</span><strong>{behavior.features.qualifyingSwapCount.toLocaleString()}</strong></article>
            <article><span>TOKENS TRADED</span><strong>{behavior.features.tradedTokenCount.toLocaleString()}</strong></article>
            <article><span>BUYS / SELLS</span><strong>{behavior.features.buyCount} / {behavior.features.sellCount}</strong></article>
            <article><span>COMPLETED / OPEN</span><strong>{behavior.features.completedPositionCount} / {behavior.features.openPositionCount}</strong></article>
            <article><span>RE-ENTRIES</span><strong>{behavior.features.reentryCount}</strong></article>
            <article><span>AVERAGE HOLD</span><strong>{formatMetric(behavior.features.avgHoldDurationSeconds, formatDuration)}</strong></article>
            <article><span>MEDIAN HOLD</span><strong>{formatMetric(behavior.features.medianHoldDurationSeconds, formatDuration)}</strong></article>
            <article><span>VOLUME</span><strong>{formatMetric(behavior.features.totalVolumeUsd, formatUsd)}</strong></article>
            <article><span>OBSERVED REALIZED PNL</span><strong>{formatMetric(behavior.features.realizedPnlUsd, formatUsd)}</strong></article>
            <article><span>PNL COVERAGE</span><strong>{formatPercent(behavior.features.realizedPnlUsd.coverage)}</strong></article>
            <article><span>TURNOVER</span><strong>{formatMetric(behavior.features.turnoverScore, formatPercent)}</strong></article>
            <article><span>CONCENTRATION</span><strong>{formatMetric(behavior.features.concentrationScore, formatPercent)}</strong></article>
            <article><span>PROGRESS EFFICIENCY</span><strong>{formatMetric(behavior.features.progressEfficiency, formatPercent)}</strong></article>
          </div>
          {!profile.dataQuality.historyComplete && <p className={styles.coverageNote}>
            Partial history: opening inventory, whole-wallet cost basis, PnL, and holding durations may be unknown. Financial metrics show only directly priced observations.
          </p>}
        </section>

        {personas && <section className={styles.profilePanel}>
          <div className={styles.sectionTitle}>
            <h2>PERSONA DEBUG</h2>
            <span>{personas.winner ? `WINNER · ${personas.winner.personaId.toUpperCase()}` : personas.resultReason === "INSUFFICIENT_HISTORY" ? "DIOGENES · SPECIAL PERSONA" : (personas.resultReason ?? "NO ELIGIBLE PERSONA")}</span>
          </div>
          <div className={styles.personaGrid}>{personas.scores.map((persona) => <article key={persona.personaId}>
            <header>
              <strong>{persona.personaId.toUpperCase()}</strong>
              <span data-eligible={persona.eligible}>{persona.eligible ? "ELIGIBLE" : "INELIGIBLE"}</span>
            </header>
            <div className={styles.personaScores}>
              <p><b>{persona.match ?? "UNKNOWN"}</b><span>MATCH</span></p>
              <p><b>{persona.confidence}</b><span>CONFIDENCE</span></p>
            </div>
            <h3>EVIDENCE</h3>
            <ul>{persona.evidence.map((item) => <li key={item.label}>
              <span>{item.label}</span><b>{item.value}</b><small>{Math.round(item.strength * 100)}%</small>
            </li>)}</ul>
            <h3>MISSING EVIDENCE</h3>
            {persona.missingEvidence.length > 0
              ? <ul>{persona.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
              : <p className={styles.completeEvidence}>NONE</p>}
          </article>)}</div>
        </section>}

        {profile.priceValidation && <section className={styles.profilePanel}>
          <div className={styles.sectionTitle}>
            <h2>PRICE COVERAGE DEBUG</h2>
            <span>REAL PROVIDER DATA · NO CURRENT-PRICE BACKFILL</span>
          </div>
          <div className={styles.behaviorMetrics}>
            <article><span>HISTORICAL ELIGIBLE EPISODES</span><strong>{profile.priceValidation.historical.historicalPriceEligibleEpisodes}</strong></article>
            <article><span>HISTORICALLY PRICED EPISODES</span><strong>{profile.priceValidation.historical.historicalPricePricedEpisodes}</strong></article>
            <article><span>HISTORICAL PRICE COVERAGE</span><strong>{formatPercent(profile.priceValidation.historical.historicalPriceCoverage)}</strong></article>
            <article><span>REQUESTED BUCKETS</span><strong>{profile.priceValidation.historical.requestedBuckets}</strong></article>
            <article><span>EXTERNAL REQUESTS</span><strong>{profile.priceValidation.historical.externalRequests}</strong></article>
            <article><span>CACHE HITS</span><strong>{profile.priceValidation.historical.cacheHits}</strong></article>
            <article><span>PROVIDER FAILURES</span><strong>{profile.priceValidation.historical.providerFailures}</strong></article>
            <article><span>UNSUPPORTED TOKENS</span><strong>{profile.priceValidation.historical.unsupportedTokens}</strong></article>
            <article><span>OPEN POSITIONS</span><strong>{profile.priceValidation.current.openPositions}</strong></article>
            <article><span>RELIABLE OPEN COST BASIS</span><strong>{profile.priceValidation.current.openPositionsWithReliableCostBasis}</strong></article>
            <article><span>OPEN CURRENT PRICES</span><strong>{profile.priceValidation.current.openPositionsWithCurrentPrice}</strong></article>
            <article><span>CURRENT PRICE COVERAGE</span><strong>{formatPercent(profile.priceValidation.current.currentPriceCoverage)}</strong></article>
            <article><span>PROFITABLE / LOSING OPEN</span><strong>{profile.priceValidation.current.profitableOpenPositions} / {profile.priceValidation.current.losingOpenPositions}</strong></article>
            <article><span>SEVERELY LOSING OPEN</span><strong>{profile.priceValidation.current.severelyLosingOpenPositions}</strong></article>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>PERSONA CANDIDATE</th><th>MINT</th><th>ENTRY COST</th><th>CURRENT VALUE</th><th>UNREALIZED PNL</th><th>RETURN</th><th>HOLD</th><th>CONFIDENCE</th><th>RESULT</th></tr></thead>
              <tbody>
                {profile.priceValidation.midasCandidates.map((candidate) => <tr key={`midas-${candidate.mint}`}>
                  <td>MIDAS</td><td title={candidate.mint}>{candidate.mint}</td><td>{formatUsd(candidate.entryCostUsd)}</td><td>{formatUsd(candidate.currentValueUsd)}</td><td>{formatUsd(candidate.unrealizedPnlUsd)}</td><td>{formatNullablePercent(candidate.unrealizedReturnPct)}</td><td>{candidate.holdingDuration === null ? "UNKNOWN" : formatDuration(candidate.holdingDuration)}</td><td>{candidate.priceConfidence}</td><td>{candidate.reason}</td>
                </tr>)}
                {profile.priceValidation.donQuixoteCandidates.map((candidate) => <tr key={`don-${candidate.mint}`}>
                  <td>DON QUIXOTE</td><td title={candidate.mint}>{candidate.mint}</td><td>{formatUsd(candidate.entryCostUsd)}</td><td>{formatUsd(candidate.currentValueUsd)}</td><td>{formatUsd(candidate.unrealizedPnlUsd)}</td><td>{formatNullablePercent(candidate.unrealizedReturnPct)}</td><td>{candidate.holdingDuration === null ? "UNKNOWN" : formatDuration(candidate.holdingDuration)}</td><td>{candidate.priceConfidence}</td><td>{candidate.reason}</td>
                </tr>)}
              </tbody>
            </table>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>ICARUS MINT</th><th>ENTRY PRICE</th><th>OBSERVED PEAK</th><th>FINAL PRICE</th><th>PEAK RETURN</th><th>GIVEBACK</th><th>COVERAGE</th><th>SAMPLES</th></tr></thead>
              <tbody>{profile.priceValidation.icarusCandidates.map((candidate) => <tr key={`icarus-${candidate.mint}`}>
                <td title={candidate.mint}>{candidate.mint}</td><td>{formatUsd(candidate.entryPriceUsd)}</td><td>{formatUsd(candidate.observedPeakPriceUsd)}</td><td>{formatUsd(candidate.finalPriceUsd)}</td><td>{formatNullablePercent(candidate.peakReturnPct)}</td><td>{formatNullablePercent(candidate.givebackPct)}</td><td>{formatPercent(candidate.historicalPriceCoverage)}</td><td>{candidate.sampleCount}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>}

        <section className={styles.ledgerPanel}>
          <div className={styles.sectionTitle}>
            <h2>SWAP VALUATIONS</h2>
            <span>EXECUTION VALUE · {valuedSwaps.length} SWAPS</span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>TIME</th><th>USD VALUE</th><th>VALUATION SOURCE</th><th>CONFIDENCE</th><th>SIGNATURE</th></tr></thead>
              <tbody>{valuedSwaps.map((transaction) => <tr key={transaction.signature}>
                <td>{formatTimestamp(transaction.timestamp)}</td>
                <td>{formatUsd(transaction.valuation?.usdValue)}</td>
                <td>{transaction.valuation?.source ?? "UNKNOWN"}</td>
                <td>{transaction.valuation?.confidence ?? "LOW"}</td>
                <td title={transaction.signature}>{transaction.signature}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.ledgerPanel}>
          <div className={styles.sectionTitle}>
            <h2>TOKEN LEDGERS</h2>
            <span>{behavior.ledgers.length} TOKENS · CLICK TO EXPAND</span>
          </div>
          <div className={styles.ledgerList}>{behavior.ledgers.map((ledger) => <details key={ledger.mint}>
            <summary>
              <span><b>{ledger.symbol ?? "UNKNOWN"}</b><small>{ledger.mint}</small></span>
              <span>{ledger.events.length} EVENTS · TRACKED {ledger.currentTrackedAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
            </summary>
            {ledger.openingStateUnknown && <p className={styles.unknownState}>OPENING STATE UNKNOWN — cost basis and position duration are not inferred.</p>}
            {!ledger.openingStateUnknown && ledger.trackingStateUnknown && <p className={styles.unknownState}>TRACKING STATE UNKNOWN — a disposal exceeded swap-tracked inventory, so later basis and duration are not inferred.</p>}
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>EVENT</th><th>TIME</th><th>AMOUNT</th><th>USD VALUE</th><th>REALIZED PNL</th><th>SIGNATURE</th></tr></thead>
                <tbody>{ledger.events.map((trade, index) => <tr key={`${trade.signature}-${trade.side}-${index}`}>
                  <td data-event={trade.eventType}>{trade.eventType.replace("_", " ")}</td>
                  <td>{formatTimestamp(trade.timestamp)}</td>
                  <td>{trade.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td>{formatUsd(trade.usdValue)}</td>
                  <td>{trade.realizedPnlUsd === null ? "UNKNOWN" : formatUsd(trade.realizedPnlUsd)}</td>
                  <td title={trade.signature}>{trade.signature}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>)}</div>
        </section>
      </>}

      <section className={styles.jsonPanel}>
        <div className={styles.sectionTitle}><h2>NORMALIZED TRANSACTIONS</h2><span>JSON · {profile.transactions.length} RECORDS</span></div>
        <pre>{JSON.stringify(profile.transactions, null, 2)}</pre>
      </section>
    </>}

    {!profile && !error && !loading && <section className={styles.empty}>
      <span>◇</span>
      <strong>WAITING FOR A PUBLIC WALLET</strong>
      <p>Data stays provider-independent after server-side normalization.</p>
    </section>}
  </main>;
}
