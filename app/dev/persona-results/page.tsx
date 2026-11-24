"use client";

import { useState } from "react";
import { PersonaResultView } from "@/components/PersonaResultView";
import { mockPersonaCards } from "@/data/mockPersonaCards";
import { buildDiogenesResult } from "@/lib/persona/personaResult";
import type { PersonaResult } from "@/lib/persona/personaResult";
import type { PersonaId } from "@/lib/persona/personaTypes";
import { getRarity } from "@/lib/personaRarity";
import styles from "../persona-cards/persona-cards.module.css";

type LoadedState =
  | { status: "IDLE" }
  | { status: "LOADING" }
  | { status: "ERROR"; message: string }
  | { status: "DONE"; result: PersonaResult; address: string; partialHistory: boolean };

const inconclusiveSample: PersonaResult = {
  kind: "INCONCLUSIVE",
  reason: "NO_STRONG_MATCH",
  qualifyingSwaps: 84,
};

const normalSamples: PersonaResult[] = mockPersonaCards.map((card) => ({
  ...card,
  match: card.match ?? 50,
  rarity: card.rarity ?? getRarity(card.match ?? 50),
  kind: "NORMAL_PERSONA" as const,
  personaId: (card.id === "don-quixote" ? "don_quixote" : card.id) as PersonaId,
  confidence: 100,
  evidence: card.metrics.map(({ label, displayValue }) => ({ label, value: displayValue })),
  story: [...card.quote],
}));

export default function PersonaResultsPage() {
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState<LoadedState>({ status: "IDLE" });

  async function analyze() {
    const address = draft.trim();
    if (!address) return;
    setLoaded({ status: "LOADING" });
    try {
      const response = await fetch("/api/analyze-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const payload = await response.json() as { message?: string; personaResult?: PersonaResult; profile?: { personaResult?: PersonaResult } };
      // 206 carries a complete analysis over a capped 1,000-transaction window —
      // a successful partial-history result, not an error.
      if (!response.ok && response.status !== 206) {
        setLoaded({ status: "ERROR", message: payload.message ?? `HTTP ${response.status}` });
        return;
      }
      const result = payload.personaResult ?? payload.profile?.personaResult;
      if (!result) {
        setLoaded({ status: "ERROR", message: "Analysis returned no persona result." });
        return;
      }
      setLoaded({ status: "DONE", result, address, partialHistory: response.status === 206 });
    } catch (error) {
      setLoaded({ status: "ERROR", message: error instanceof Error ? error.message : "Request failed." });
    }
  }

  return <main className={styles.gallery}>
    <header className={styles.intro}>
      <p>DEVELOPMENT VALIDATION · PRODUCTION RESULT SURFACE</p>
      <h1>PERSONA RESULTS</h1>
      <span>The exact production component chain: analysis → routing → PersonaResultView.</span>
      <a href="/dev/newton-story" style={{ display: "inline-block", marginTop: 14, color: "#2454c6", fontWeight: 900 }}>OPEN NEWTON STORY FIXTURES →</a>
    </header>

    <section className={styles.controls} aria-label="Real wallet loader">
      <label className={styles.matchControl}>
        <span>REAL WALLET ADDRESS</span>
        <input
          aria-label="Solana wallet address"
          value={draft}
          placeholder="Paste a Solana wallet…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && analyze()}
          style={{ width: "100%", fontSize: ".9rem", padding: ".4rem .5rem", border: "2px solid #12285b", borderRadius: 4, background: "#f5e9ce", fontFamily: "inherit", fontWeight: 700 }}
        />
        <button type="button" onClick={analyze}>ANALYZE</button>
      </label>
    </section>

    <section aria-label="Real wallet result">
      {loaded.status === "LOADING" && <p className={styles.intro}>ANALYZING — full history plus pricing can take 1–2 minutes on a cold cache…</p>}
      {loaded.status === "ERROR" && <p className={styles.empty} role="alert">ANALYSIS FAILED — {loaded.message}</p>}
      {loaded.status === "DONE" && <>
        <p className={styles.intro}>
          {loaded.address} → {loaded.result.kind}
          {loaded.partialHistory ? " · PARTIAL HISTORY (1,000-tx cap — metrics cover the analyzed window only)" : ""}
        </p>
        <PersonaResultView
          result={loaded.result}
          onTryAnother={() => setLoaded({ status: "IDLE" })}
          onRetry={() => void analyze()}
        />
      </>}
    </section>

    <section aria-label="Special persona preview">
      <header className={styles.intro}>
        <p>SPECIAL PERSONA · 0 / 5 / 9 QUALIFYING TRADES</p>
        <h1>DIOGENES</h1>
      </header>
      <div className={styles.grid}>
        {[0, 5, 9].map((qualifyingSwaps) => <div className={styles.cardSlot} key={qualifyingSwaps}>
          <PersonaResultView result={buildDiogenesResult(qualifyingSwaps)} />
        </div>)}
      </div>
    </section>

    <section aria-label="Inconclusive preview">
      <header className={styles.intro}>
        <p>INCONCLUSIVE · 10+ SWAPS, NO STRONG MATCH</p>
        <h1>HARD TO READ</h1>
      </header>
      <PersonaResultView result={inconclusiveSample} onTryAnother={() => setLoaded({ status: "IDLE" })} />
    </section>

    <section aria-label="Fixture-only metric identity check">
      <header className={styles.intro}>
        <p>DEV FIXTURES ONLY · METRIC-LABEL IDENTITY THROUGH THE PRODUCTION CARD COMPONENT</p>
        <h1>THE EIGHT</h1>
        <span>Fixture numbers — production results always use real wallet-derived metrics.</span>
      </header>
      <div className={styles.grid}>
        {normalSamples.map((result) => <div className={styles.cardSlot} key={result.kind === "NORMAL_PERSONA" ? result.personaId : result.kind}>
          <PersonaResultView result={result} />
        </div>)}
      </div>
    </section>
  </main>;
}
