import "server-only";

import { normalizeTransactions } from "@/lib/analysis/normalizeTransactions";
import { reconstructPositions } from "@/lib/analysis/reconstructPositions";
import { mapWithConcurrency } from "./concurrency";
import {
  normalizeSolWsolEconomicFlows,
  WSOL_MINT,
  type SolWsolNativeTransfer,
  type SolWsolNormalization,
  type SolWsolTokenTransfer,
} from "./solWsolFlows";

export const MAX_TRANSACTIONS = 1000;
export const HELIUS_BALANCES_ENDPOINT = "/v1/wallet/{address}/balances";
export const HELIUS_HISTORY_ENDPOINT = "/v1/wallet/{address}/history";
export const HELIUS_PARSED_TRANSACTIONS_ENDPOINT = "/v0/transactions";

const HELIUS_API_ORIGIN = "https://api.helius.xyz";
const PAGE_SIZE = 100;
const MAX_BALANCE_PAGES = 100;
const MAX_RATE_LIMIT_RETRIES = 3;
const PROVIDER_TIMEOUT_MS = 15_000;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Provider response types deliberately live in this module. No UI or route should
// consume them directly; buildWalletProfile is the public boundary.
export type HeliusBalance = {
  mint: string;
  symbol?: string | null;
  balance: number;
  usdValue?: number | null;
};

type HeliusBalancesPage = {
  balances?: HeliusBalance[];
  totalUsdValue?: number | null;
  pagination?: {
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
};

export type HeliusBalanceChange = {
  mint: string;
  amount: number;
  decimals?: number;
};

export type HeliusHistoryTransaction = {
  signature: string;
  timestamp: number | null;
  type?: string | null;
  fee?: number | null;
  feePayer?: string | null;
  error?: unknown;
  balanceChanges?: HeliusBalanceChange[];
  source?: string | null;
  programIds?: string[];
  solWsolNormalization?: SolWsolNormalization;
};

type HeliusHistoryPage = {
  data?: HeliusHistoryTransaction[];
  pagination?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  };
};

type HeliusParsedTransaction = {
  signature?: string;
  type?: string | null;
  source?: string | null;
  instructions?: Array<{ programId?: string }>;
  events?: {
    swap?: {
      nativeInput?: { account?: string; amount?: string | number } | null;
      nativeOutput?: { account?: string; amount?: string | number } | null;
      tokenInputs?: HeliusParsedSwapToken[];
      tokenOutputs?: HeliusParsedSwapToken[];
    } | null;
  } | null;
  nativeTransfers?: SolWsolNativeTransfer[];
  tokenTransfers?: SolWsolTokenTransfer[];
  fee?: number | null;
};

type HeliusParsedSwapToken = {
  userAccount?: string;
  mint?: string;
  rawTokenAmount?: {
    tokenAmount?: string | number;
    decimals?: number;
  };
};

type HeliusParsedEnrichment = {
  type?: string;
  balanceChanges?: HeliusBalanceChange[];
  source?: string;
  programIds?: string[];
  solWsolNormalization?: SolWsolNormalization;
};

type ParsedEnrichmentCacheEntry = {
  expiresAt: number;
  enrichment: HeliusParsedEnrichment;
};

export type HeliusWalletData = {
  balances: HeliusBalance[];
  transactions: HeliusHistoryTransaction[];
  historyComplete: boolean;
  /**
   * True when the balance request was skipped because the COMPLETE analysis
   * window proves fewer than the general history minimum of qualifying swaps:
   * every Persona is ineligible regardless of holdings, so current-balance
   * data cannot influence any result. This is decided only AFTER the entire
   * transaction window is classified — never from partial pages.
   */
  balancesSkippedForLowActivity?: boolean;
};

// ---- Request-identity telemetry (dev/test only) ----
// Records method+path+body identity of every Helius request so tests and dev
// tooling can detect duplicate fetches. Never records query strings or
// headers, so API keys cannot leak. Enabled by HELIUS_TRACE_DUPLICATES=1 or
// the exported test hook.
const requestIdentities: string[] = [];
let telemetryEnabled = process.env.HELIUS_TRACE_DUPLICATES === "1";
const PARSED_ENRICHMENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PARSED_ENRICHMENT_CACHE_MAX_ENTRIES = 50_000;
const heliusGlobal = globalThis as typeof globalThis & {
  __web3rpgParsedEnrichmentCache?: Map<string, ParsedEnrichmentCacheEntry>;
};
// Parsed transactions are immutable once confirmed. Keeping this cache on
// globalThis preserves it across development hot reloads and lets overlapping
// 1,000-transaction windows reuse the expensive enrichment step.
const parsedEnrichmentCache = heliusGlobal.__web3rpgParsedEnrichmentCache
  ??= new Map<string, ParsedEnrichmentCacheEntry>();

function parsedCacheKey(address: string, signature: string) {
  return `${address}:${signature}`;
}

function readParsedEnrichment(address: string, signature: string) {
  const key = parsedCacheKey(address, signature);
  const cached = parsedEnrichmentCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    parsedEnrichmentCache.delete(key);
    return undefined;
  }
  return cached.enrichment;
}

function writeParsedEnrichment(address: string, signature: string, enrichment: HeliusParsedEnrichment) {
  if (parsedEnrichmentCache.size >= PARSED_ENRICHMENT_CACHE_MAX_ENTRIES) {
    const oldest = parsedEnrichmentCache.keys().next().value as string | undefined;
    if (oldest) parsedEnrichmentCache.delete(oldest);
  }
  parsedEnrichmentCache.set(parsedCacheKey(address, signature), {
    enrichment,
    expiresAt: Date.now() + PARSED_ENRICHMENT_CACHE_TTL_MS,
  });
}

function recordRequestIdentity(method: string, url: URL, body?: string) {
  if (!telemetryEnabled) return;
  // Content hash (not the content) so identical requests are detectable
  // without ever logging signatures or keys; query params are included
  // EXCEPT api-key so paginated requests stay distinguishable.
  let hash = 0;
  if (body) {
    for (let index = 0; index < body.length; index += 1) {
      hash = (Math.imul(31, hash) + body.charCodeAt(index)) | 0;
    }
  }
  const safeQuery = [...url.searchParams.entries()]
    .filter(([key]) => key !== "api-key")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("&");
  requestIdentities.push(`${method} ${url.pathname}${safeQuery ? `?${safeQuery}` : ""}${body ? `#${hash.toString(36)}` : ""}`);
}

export const __heliusTestHooks = {
  enableRequestTelemetry() { telemetryEnabled = true; },
  resetRequestTelemetry() { requestIdentities.length = 0; },
  resetParsedEnrichmentCache() { parsedEnrichmentCache.clear(); },
  getRequestTelemetry: () => [...requestIdentities],
  getDuplicateRequestIdentities(): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const identity of requestIdentities) {
      if (seen.has(identity)) duplicates.add(identity);
      seen.add(identity);
    }
    return [...duplicates];
  },
};

/**
 * Mirrors the general Persona history minimum (lib/persona personaScoring).
 * Kept as a literal so the fetch layer never imports scoring code.
 */
const LOW_ACTIVITY_BALANCE_SKIP_THRESHOLD = 10;

function countQualifyingSwaps(transactions: HeliusHistoryTransaction[]): number {
  // Holdings only contribute display symbols during normalization. The
  // qualifying-swap gate depends on transaction type, netted directions and
  // quote-asset mints, so it can be evaluated exactly before balances load.
  const normalized = normalizeTransactions(transactions, []);
  return reconstructPositions(normalized).qualifyingSwapCount;
}

export class HeliusError extends Error {
  constructor(
    public readonly kind: "RATE_LIMITED" | "PROVIDER_ERROR",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HeliusError";
  }
}

async function heliusRequest<T>(
  path: string,
  searchParams: URLSearchParams,
  init?: RequestInit,
  apiKeyInQuery = false,
): Promise<T> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new HeliusError("PROVIDER_ERROR", "HELIUS_API_KEY is not configured on the server.");
  }

  const url = new URL(path, HELIUS_API_ORIGIN);
  if (apiKeyInQuery) searchParams.set("api-key", apiKey);
  url.search = searchParams.toString();

  let response: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      recordRequestIdentity(init?.method ?? "GET", url, typeof init?.body === "string" ? init.body : undefined);
      response = await fetch(url, {
        ...init,
        headers: {
          ...(!apiKeyInQuery ? { "X-Api-Key": apiKey } : {}),
          ...init?.headers,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch {
      throw new HeliusError("PROVIDER_ERROR", "Unable to reach the Helius API.");
    }

    if (response.status !== 429) break;
    if (attempt === MAX_RATE_LIMIT_RETRIES) {
      throw new HeliusError("RATE_LIMITED", "Helius rate limit exceeded after retries.", 429);
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 5000)
      : Math.min(500 * (2 ** attempt), 5000);
    // Jitter avoids synchronized retry bursts when several concurrent
    // requests hit the rate limit together.
    await delay(backoffMs + Math.floor(Math.random() * 250));
  }

  if (!response) {
    throw new HeliusError("PROVIDER_ERROR", "Helius did not return a response.");
  }

  if (!response.ok) {
    throw new HeliusError(
      "PROVIDER_ERROR",
      `Helius request failed with status ${response.status}.`,
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new HeliusError("PROVIDER_ERROR", "Helius returned an invalid JSON response.");
  }
}

function heliusGet<T>(path: string, searchParams: URLSearchParams): Promise<T> {
  return heliusRequest<T>(path, searchParams);
}

function decimalAmount(value: string | number | undefined, decimals: number): number | undefined {
  if ((typeof value !== "string" && typeof value !== "number") || !Number.isFinite(decimals)) {
    return undefined;
  }
  const amount = Number(value) / (10 ** decimals);
  return Number.isFinite(amount) ? amount : undefined;
}

function parsedSwapBalanceChanges(
  transaction: HeliusParsedTransaction,
  address: string,
): HeliusBalanceChange[] | undefined {
  if (transaction.type !== "SWAP" || !transaction.events?.swap) return undefined;
  const swap = transaction.events.swap;
  const changes: HeliusBalanceChange[] = [];

  if (swap.nativeInput?.account === address) {
    const amount = decimalAmount(swap.nativeInput.amount, 9);
    if (amount !== undefined) changes.push({ mint: "SOL", amount: -amount, decimals: 9 });
  }
  if (swap.nativeOutput?.account === address) {
    const amount = decimalAmount(swap.nativeOutput.amount, 9);
    if (amount !== undefined) changes.push({ mint: "SOL", amount, decimals: 9 });
  }

  for (const [tokens, direction] of [
    [swap.tokenInputs ?? [], -1],
    [swap.tokenOutputs ?? [], 1],
  ] as const) {
    for (const token of tokens) {
      if (token.userAccount !== address || !token.mint || !token.rawTokenAmount) continue;
      const decimals = token.rawTokenAmount.decimals;
      if (!Number.isFinite(decimals)) continue;
      const amount = decimalAmount(token.rawTokenAmount.tokenAmount, decimals as number);
      if (amount !== undefined) {
        changes.push({ mint: token.mint, amount: amount * direction, decimals });
      }
    }
  }

  return changes.length > 0 ? changes : undefined;
}

/**
 * Parsed-transaction batch concurrency. Signatures are known before batching,
 * so batches are independent; 3 keeps 429 pressure low on the shared plan
 * (selected in Phase 8B experiments; override with HELIUS_PARSED_CONCURRENCY).
 */
const PARSED_BATCH_CONCURRENCY = (() => {
  const configured = Number(process.env.HELIUS_PARSED_CONCURRENCY);
  return Number.isFinite(configured) && configured >= 1 && configured <= 8
    ? Math.trunc(configured)
    : 3;
})();

async function fetchParsedTransactionEnrichments(
  transactions: HeliusHistoryTransaction[],
  address: string,
): Promise<Map<string, HeliusParsedEnrichment>> {
  const enrichments = new Map<string, HeliusParsedEnrichment>();
  const originalBySignature = new Map(
    transactions.map((transaction) => [transaction.signature, transaction]),
  );
  const signatures = transactions
    .filter((transaction) => !transaction.type || (
      transaction.balanceChanges?.some((change) => change.mint === WSOL_MINT)
      && transaction.balanceChanges.some((change) => change.mint === "SOL")
    ))
    .map((transaction) => transaction.signature)
    .filter(Boolean);

  const uncachedSignatures: string[] = [];
  for (const signature of signatures) {
    const cached = readParsedEnrichment(address, signature);
    if (cached) enrichments.set(signature, cached);
    else uncachedSignatures.push(signature);
  }

  const batches: string[][] = [];
  for (let index = 0; index < uncachedSignatures.length; index += PAGE_SIZE) {
    batches.push(uncachedSignatures.slice(index, index + PAGE_SIZE));
  }

  // Bounded concurrency; results merge into a signature-keyed map, so output
  // is identical to the previous serial implementation regardless of the
  // order batches resolve in. Error semantics are unchanged: an exhausted
  // rate limit aborts enrichment, any other enrichment failure keeps whatever
  // was gathered and lets the analysis continue on history data alone.
  let enrichmentAborted = false;
  await mapWithConcurrency(batches, PARSED_BATCH_CONCURRENCY, async (batch) => {
    if (enrichmentAborted) return;
    let parsed: HeliusParsedTransaction[];
    try {
      parsed = await heliusRequest<HeliusParsedTransaction[]>(
        HELIUS_PARSED_TRANSACTIONS_ENDPOINT,
        new URLSearchParams(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: batch }),
        },
        true,
      );
    } catch (error) {
      // Transaction classification is an enrichment. A deprecated/plan-limited
      // parser must not turn valid balance history into invented classifications.
      if (error instanceof HeliusError && error.kind === "RATE_LIMITED") throw error;
      enrichmentAborted = true;
      return;
    }
    if (!Array.isArray(parsed)) {
      enrichmentAborted = true;
      return;
    }
    for (const transaction of parsed) {
      if (transaction.signature) {
        const parsedBalanceChanges = parsedSwapBalanceChanges(transaction, address);
        const original = originalBySignature.get(transaction.signature);
        const swap = transaction.events?.swap;
        const nativeSwapInputSol = swap?.nativeInput?.account === address
          ? decimalAmount(swap.nativeInput.amount, 9)
          : undefined;
        const nativeSwapOutputSol = swap?.nativeOutput?.account === address
          ? decimalAmount(swap.nativeOutput.amount, 9)
          : undefined;
        const normalizationInputChanges = original?.type
          ? original.balanceChanges ?? []
          : parsedBalanceChanges ?? original?.balanceChanges ?? [];
        const normalizedFlows = normalizeSolWsolEconomicFlows({
          wallet: address,
          balanceChanges: normalizationInputChanges,
          nativeTransfers: transaction.nativeTransfers,
          tokenTransfers: transaction.tokenTransfers,
          nativeSwapInputSol,
          nativeSwapOutputSol,
          feeLamports: transaction.fee ?? original?.fee,
        });
        const balanceChanges = normalizedFlows.balanceChanges.length > 0
          ? normalizedFlows.balanceChanges
          : parsedBalanceChanges;
        const programIds = Array.from(new Set(
          (transaction.instructions ?? [])
            .map((instruction) => instruction.programId)
            .filter((programId): programId is string => Boolean(programId)),
        ));
        const enrichment: HeliusParsedEnrichment = {
          ...(transaction.type ? { type: transaction.type } : {}),
          ...(balanceChanges ? { balanceChanges } : {}),
          ...(transaction.source ? { source: transaction.source } : {}),
          ...(programIds.length > 0 ? { programIds } : {}),
          ...(normalizedFlows.normalization
            ? { solWsolNormalization: normalizedFlows.normalization }
            : {}),
        };
        enrichments.set(transaction.signature, enrichment);
        writeParsedEnrichment(address, transaction.signature, enrichment);
      }
    }
  });
  return enrichments;
}async function fetchAllBalances(address: string): Promise<HeliusBalance[]> {
  const balances: HeliusBalance[] = [];

  for (let page = 1; page <= MAX_BALANCE_PAGES; page += 1) {
    const result = await heliusGet<HeliusBalancesPage>(
      `/v1/wallet/${encodeURIComponent(address)}/balances`,
      new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        showZeroBalance: "false",
        showNative: "true",
        showNfts: "false",
      }),
    );

    if (!Array.isArray(result.balances)) {
      throw new HeliusError("PROVIDER_ERROR", "Helius balances response is missing balances.");
    }

    balances.push(...result.balances);
    if (!result.pagination?.hasMore) return balances;
  }

  throw new HeliusError("PROVIDER_ERROR", "Wallet holdings exceeded the supported pagination guard.");
}

async function fetchTransactionHistory(
  address: string,
  maxTransactions: number,
): Promise<Pick<HeliusWalletData, "transactions" | "historyComplete">> {
  const transactions: HeliusHistoryTransaction[] = [];
  let before: string | undefined;

  while (transactions.length < maxTransactions) {
    const limit = Math.min(PAGE_SIZE, maxTransactions - transactions.length);
    const params = new URLSearchParams({
      limit: String(limit),
      tokenAccounts: "balanceChanged",
    });
    if (before) params.set("before", before);

    const result = await heliusGet<HeliusHistoryPage>(
      `/v1/wallet/${encodeURIComponent(address)}/history`,
      params,
    );

    if (!Array.isArray(result.data)) {
      throw new HeliusError("PROVIDER_ERROR", "Helius history response is missing transaction data.");
    }

    transactions.push(...result.data.slice(0, limit));

    if (!result.pagination?.hasMore) {
      return { transactions, historyComplete: true };
    }

    const nextCursor = result.pagination.nextCursor;
    if (!nextCursor || nextCursor === before || result.data.length === 0) {
      throw new HeliusError("PROVIDER_ERROR", "Helius history pagination did not advance.");
    }
    before = nextCursor;
  }

  return { transactions, historyComplete: false };
}

export async function fetchHeliusWalletData(
  address: string,
  maxTransactions = MAX_TRANSACTIONS,
): Promise<HeliusWalletData> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(maxTransactions), MAX_TRANSACTIONS));
  const history = await fetchTransactionHistory(address, safeLimit);

  // Most active wallets are already unambiguously above the threshold in the
  // history response. Keep their balance load concurrent with parsed
  // enrichment; only defer balances when enrichment could still prove the
  // wallet is low-activity and make that request unnecessary.
  const preliminaryQualifyingSwaps = countQualifyingSwaps(history.transactions);
  let balances: HeliusBalance[] | undefined;
  let parsedEnrichments: Map<string, HeliusParsedEnrichment>;
  if (preliminaryQualifyingSwaps >= LOW_ACTIVITY_BALANCE_SKIP_THRESHOLD) {
    [parsedEnrichments, balances] = await Promise.all([
      fetchParsedTransactionEnrichments(history.transactions, address),
      fetchAllBalances(address),
    ]);
  } else {
    parsedEnrichments = await fetchParsedTransactionEnrichments(history.transactions, address);
  }
  const transactions = history.transactions.map((transaction) => {
    const enrichment = parsedEnrichments.get(transaction.signature);
    // Enhanced parsing classifies the whole transaction. Only call it this
    // wallet's SWAP when the provider's parsed swap event explicitly includes
    // the analyzed address as an input/output participant.
    const enrichedType = enrichment?.type === "SWAP" && !enrichment.balanceChanges
      ? undefined
      : enrichment?.type;
    return {
      ...transaction,
      type: transaction.type ?? enrichedType,
      balanceChanges: enrichment?.balanceChanges ?? transaction.balanceChanges,
      source: enrichment?.source ?? transaction.source,
      programIds: enrichment?.programIds ?? transaction.programIds,
      solWsolNormalization: enrichment?.solWsolNormalization ?? transaction.solWsolNormalization,
    };
  });

  // Conditional enrichment (full window already classified here): with fewer
  // qualifying swaps than the general history minimum, no Persona can become
  // eligible and the Diogenes card needs only the swap count — current
  // balances cannot change any outcome, so the (heavily paginated) balance
  // request is skipped.
  const qualifyingSwapCount = countQualifyingSwaps(transactions);
  if (qualifyingSwapCount < LOW_ACTIVITY_BALANCE_SKIP_THRESHOLD) {
    return {
      balances: [],
      transactions,
      historyComplete: history.historyComplete,
      balancesSkippedForLowActivity: true,
    };
  }
  return {
    balances: balances ?? await fetchAllBalances(address),
    transactions,
    historyComplete: history.historyComplete,
  };
}
