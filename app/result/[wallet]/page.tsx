"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PersonaResultView } from "@/components/PersonaResultView";
import type { PersonaResult } from "@/lib/persona/personaResult";
import { readCachedPersonaResult, writeCachedPersonaResult } from "@/lib/persona/personaResultCache";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function isValidSolanaPublicKey(value: string) {
  if (value.length > 44) return false;
  let number = BigInt(0);
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    number = number * BigInt(58) + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > BigInt(0)) {
    bytes.push(Number(number % BigInt(256)));
    number /= BigInt(256);
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  return bytes.length === 32;
}

type State =
  | { status: "LOADING" }
  | { status: "ERROR"; message: string }
  | { status: "DONE"; result: PersonaResult; partialHistory: boolean };

/**
 * Shareable wallet result. Analysis is requested from the browser against the
 * proven /api/analyze-wallet route (owner of the 10-minute profile cache);
 * rendering uses the exact production PersonaResultView chain.
 */
export default function WalletResultPage() {
  const params = useParams<{ wallet: string }>();
  const wallet = decodeURIComponent(Array.isArray(params.wallet) ? params.wallet[0] : params.wallet);
  const [state, setState] = useState<State>({ status: "LOADING" });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isValidSolanaPublicKey(wallet)) {
      setState({ status: "ERROR", message: "THAT IS NOT A SOLANA WALLET." });
      return;
    }
    let cancelled = false;
    const cached = readCachedPersonaResult(wallet);
    if (cached) {
      setState({ status: "DONE", result: cached.result, partialHistory: cached.partialHistory });
      return;
    }
    setState({ status: "LOADING" });
    (async () => {
      try {
        const response = await fetch("/api/analyze-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: wallet }),
        });
        type AnalyzePayload = {
          message?: string;
          personaResult?: PersonaResult;
          profile?: { personaResult?: PersonaResult };
        };
        const payload = await response.json() as AnalyzePayload;
        if (!response.ok && response.status !== 206) {
          if (!cancelled) setState({ status: "ERROR", message: payload.message ?? `HTTP ${response.status}` });
          return;
        }
        const result = payload.personaResult ?? payload.profile?.personaResult;
        if (!result) {
          if (!cancelled) setState({ status: "ERROR", message: "Analysis returned no persona result." });
          return;
        }
        if (!cancelled) {
          writeCachedPersonaResult(wallet, result, response.status === 206);
          setState({ status: "DONE", result, partialHistory: response.status === 206 });
        }
      } catch (error) {
        if (!cancelled) setState({ status: "ERROR", message: error instanceof Error ? error.message : "Request failed." });
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, retryKey]);

  return <main className="result-shell">
    <p className="result-meta">{wallet}</p>
    {state.status === "LOADING" && <section className="result-loading">
      <p>ANALYZING WALLET</p>
      <h1>THIS TAKES 1–2 MINUTES.</h1>
      <p className="result-loading-note">Full history pagination plus historical pricing. Results are cached for 10 minutes.</p>
    </section>}
    {state.status === "ERROR" && <section className="result-error">
      <p>{isValidSolanaPublicKey(wallet) ? "ANALYSIS FAILED" : "INVALID ADDRESS"}</p>
      <h1>{state.message}</h1>
      <Link className="result-cta" href="/dev/persona-results">TRY ANOTHER WALLET</Link>
    </section>}
    {state.status === "DONE" && <>
      <p className="result-meta">
        {state.result.kind}{state.partialHistory ? " · PARTIAL HISTORY (1,000-tx cap)" : ""}
      </p>
      <PersonaResultView
        result={state.result}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
      <p className="result-links"><Link href="/dev/persona-results">ANALYZE ANOTHER WALLET</Link></p>
    </>}
  </main>;
}
