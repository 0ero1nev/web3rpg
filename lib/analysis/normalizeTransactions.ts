import type {
  HeliusBalance,
  HeliusHistoryTransaction,
} from "@/lib/solana/helius";
import type {
  NormalizedTransaction,
  NormalizedTransactionType,
  TokenHolding,
} from "@/lib/analysis/types";

export const NATIVE_SOL_MINT = "SOL";
const HELIUS_NATIVE_SOL_MINT = "So11111111111111111111111111111111111111111";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMint(mint: string): string {
  return mint === "SOL" || mint === HELIUS_NATIVE_SOL_MINT
    ? NATIVE_SOL_MINT
    : mint;
}

function normalizeType(type?: string | null): NormalizedTransactionType {
  if (type === "SWAP") return "SWAP";
  if (type === "TRANSFER") return "TRANSFER";
  return "OTHER";
}

/**
 * Helius intermittently returns null `type`/`source` for recent transactions
 * (observed 2026-10: entire recent windows unclassified). Provider labels are
 * respected when present; when absent, fall back to the same structural
 * definition the reconstruction engine already gates on — a swap-like record
 * nets at least one inbound AND one outbound asset change. Anything one-sided
 * is a transfer, and the qualifying-swap rules (in + out + non-quote leg)
 * remain the final gate, so nothing is fabricated here.
 */
function inferStructuralType(tokenChanges: Array<{ direction: "IN" | "OUT" }>): NormalizedTransactionType {
  const hasIn = tokenChanges.some((change) => change.direction === "IN");
  const hasOut = tokenChanges.some((change) => change.direction === "OUT");
  if (hasIn && hasOut) return "SWAP";
  return tokenChanges.length > 0 ? "TRANSFER" : "OTHER";
}

export function normalizeHoldings(rawBalances: HeliusBalance[]): TokenHolding[] {
  return rawBalances.flatMap((holding) => {
    if (!holding.mint || !finiteNumber(holding.balance)) return [];

    return [{
      mint: normalizeMint(holding.mint),
      ...(holding.symbol ? { symbol: holding.symbol } : {}),
      amount: holding.balance,
      ...(finiteNumber(holding.usdValue) ? { usdValue: holding.usdValue } : {}),
    }];
  });
}

export function normalizeTransactions(
  rawTransactions: HeliusHistoryTransaction[],
  holdings: TokenHolding[],
): NormalizedTransaction[] {
  const symbols = new Map(
    holdings.flatMap((holding) => holding.symbol ? [[holding.mint, holding.symbol] as const] : []),
  );

  return rawTransactions.flatMap((transaction) => {
    // The internal contract requires a real timestamp. Helius documents that
    // very recent transactions can temporarily return null, so omit those
    // records rather than fabricating a timestamp.
    if (!transaction.signature || !finiteNumber(transaction.timestamp)) return [];

    const netChanges = new Map<string, number>();
    for (const change of transaction.balanceChanges ?? []) {
      if (!change.mint || !finiteNumber(change.amount) || change.amount === 0) continue;
      const mint = normalizeMint(change.mint);
      netChanges.set(mint, (netChanges.get(mint) ?? 0) + change.amount);
    }

    const tokenChanges = Array.from(netChanges.entries()).flatMap(([mint, amount]) => {
      if (Math.abs(amount) < Number.EPSILON) return [];
      const symbol = mint === NATIVE_SOL_MINT ? "SOL" : symbols.get(mint);

      return [{
        mint,
        ...(symbol ? { symbol } : {}),
        amount: Math.abs(amount),
        direction: amount > 0 ? "IN" as const : "OUT" as const,
        // Helius history does not provide historical USD prices. Never apply
        // today's holding price to an older transaction.
      }];
    });

    const labeledType = normalizeType(transaction.type);
    // When the provider label is missing entirely, classify structurally from
    // the netted asset changes; when a label exists, respect it.
    const type = transaction.type == null && labeledType === "OTHER"
      ? inferStructuralType(tokenChanges)
      : labeledType;

    return [{
      signature: transaction.signature,
      timestamp: transaction.timestamp,
      type,
      // The provider reports fees in SOL, not historical USD, so feeUsd stays absent.
      ...(finiteNumber(transaction.fee) && transaction.fee >= 0
        ? { networkFeeSol: transaction.fee / 1_000_000_000 }
        : {}),
      ...(transaction.source ? { source: transaction.source } : {}),
      ...(transaction.programIds?.length ? { programIds: transaction.programIds } : {}),
      tokenChanges,
      ...(transaction.solWsolNormalization
        ? { solWsolNormalization: { ...transaction.solWsolNormalization } }
        : {}),
    }];
  });
}
