export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const NATIVE_SOL_MINTS = new Set([
  "SOL",
  "So11111111111111111111111111111111111111111",
]);
const LAMPORTS_PER_SOL = 1_000_000_000;
const MATCH_TOLERANCE_SOL = 1 / LAMPORTS_PER_SOL;

export type SolWsolBalanceChange = {
  mint: string;
  amount: number;
  decimals?: number;
};

export type SolWsolNativeTransfer = {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  amount?: number | string | null;
};

export type SolWsolTokenTransfer = {
  fromTokenAccount?: string | null;
  toTokenAccount?: string | null;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  tokenAmount?: number | string | null;
  mint?: string | null;
};

export type SolWsolNormalization = {
  wrappedSolAmount: number;
  unwrappedSolAmount: number;
  excludedNativeSolOut: number;
  excludedNativeSolIn: number;
  ancillaryNativeSolOut: number;
  ancillaryNativeSolIn: number;
  networkFeeSol?: number;
};

export type NormalizeSolWsolFlowInput = {
  wallet: string;
  balanceChanges: SolWsolBalanceChange[];
  nativeTransfers?: SolWsolNativeTransfer[];
  tokenTransfers?: SolWsolTokenTransfer[];
  /** Explicit native swap principal reported by the parsed swap event, if any. */
  nativeSwapInputSol?: number;
  nativeSwapOutputSol?: number;
  feeLamports?: number | null;
};

function positiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function amountsMatch(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(
    MATCH_TOLERANCE_SOL,
    Math.max(left, right) * 1e-9,
  );
}

function nativeTransferSol(transfer: SolWsolNativeTransfer) {
  const lamports = positiveNumber(transfer.amount);
  return lamports === undefined ? undefined : lamports / LAMPORTS_PER_SOL;
}

function matchedWrapAmounts(input: NormalizeSolWsolFlowInput) {
  const nativeTransfers = input.nativeTransfers ?? [];
  const usedNativeTransfers = new Set<number>();
  let wrappedSolAmount = 0;
  let unwrappedSolAmount = 0;
  let wrapAccountRefundSol = 0;
  let unwrapAccountFundingSol = 0;

  for (const token of input.tokenTransfers ?? []) {
    if (token.mint !== WSOL_MINT) continue;
    const tokenAmount = positiveNumber(token.tokenAmount);
    if (tokenAmount === undefined) continue;

    if (token.fromUserAccount === input.wallet && token.fromTokenAccount) {
      const matchIndex = nativeTransfers.findIndex((native, index) => {
        if (usedNativeTransfers.has(index)) return false;
        const amount = nativeTransferSol(native);
        return native.fromUserAccount === input.wallet
          && native.toUserAccount === token.fromTokenAccount
          && amount !== undefined
          && amountsMatch(amount, tokenAmount);
      });
      if (matchIndex >= 0) {
        usedNativeTransfers.add(matchIndex);
        wrappedSolAmount += tokenAmount;
        wrapAccountRefundSol += nativeTransfers.reduce((sum, native, index) => {
          if (index === matchIndex) return sum;
          const amount = nativeTransferSol(native);
          return native.fromUserAccount === token.fromTokenAccount
            && native.toUserAccount === input.wallet
            && amount !== undefined
            ? sum + amount
            : sum;
        }, 0);
      }
    }

    if (token.toUserAccount === input.wallet && token.toTokenAccount) {
      const matchIndex = nativeTransfers.findIndex((native, index) => {
        if (usedNativeTransfers.has(index)) return false;
        const amount = nativeTransferSol(native);
        return native.fromUserAccount === token.toTokenAccount
          && native.toUserAccount === input.wallet
          && amount !== undefined
          && amountsMatch(amount, tokenAmount);
      });
      if (matchIndex >= 0) {
        usedNativeTransfers.add(matchIndex);
        unwrappedSolAmount += tokenAmount;
        unwrapAccountFundingSol += nativeTransfers.reduce((sum, native, index) => {
          if (index === matchIndex) return sum;
          const amount = nativeTransferSol(native);
          return native.fromUserAccount === input.wallet
            && native.toUserAccount === token.toTokenAccount
            && amount !== undefined
            ? sum + amount
            : sum;
        }, 0);
      }
    }
  }

  return {
    wrappedSolAmount,
    unwrappedSolAmount,
    wrapAccountRefundSol,
    unwrapAccountFundingSol,
  };
}

/**
 * Removes a native SOL leg only when transfer-level evidence proves that it is
 * the funding/closing side of the same WSOL flow. Native and WSOL merely being
 * present together is intentionally insufficient.
 */
export function normalizeSolWsolEconomicFlows(input: NormalizeSolWsolFlowInput): {
  balanceChanges: SolWsolBalanceChange[];
  normalization?: SolWsolNormalization;
} {
  const {
    wrappedSolAmount,
    unwrappedSolAmount,
    wrapAccountRefundSol,
    unwrapAccountFundingSol,
  } = matchedWrapAmounts(input);
  if (wrappedSolAmount === 0 && unwrappedSolAmount === 0) {
    return { balanceChanges: input.balanceChanges.map((change) => ({ ...change })) };
  }

  const nativeOut = input.balanceChanges
    .filter((change) => NATIVE_SOL_MINTS.has(change.mint) && change.amount < 0)
    .reduce((sum, change) => sum + Math.abs(change.amount), 0);
  const nativeIn = input.balanceChanges
    .filter((change) => NATIVE_SOL_MINTS.has(change.mint) && change.amount > 0)
    .reduce((sum, change) => sum + change.amount, 0);
  const explicitInput = Math.max(0, input.nativeSwapInputSol ?? 0);
  const explicitOutput = Math.max(0, input.nativeSwapOutputSol ?? 0);
  // If the parser explicitly reports native principal in addition to the
  // proven wrap, retain only the unmatched portion as an independent flow.
  const independentNativeOut = wrappedSolAmount > 0
    ? Math.max(0, explicitInput - wrappedSolAmount)
    : Math.max(0, nativeOut - unwrapAccountFundingSol);
  const independentNativeIn = unwrappedSolAmount > 0
    ? Math.max(0, explicitOutput - unwrappedSolAmount)
    : Math.max(0, nativeIn - wrapAccountRefundSol);
  const suppressOut = wrappedSolAmount > 0;
  const suppressIn = unwrappedSolAmount > 0;

  const balanceChanges = input.balanceChanges.filter((change) =>
    !NATIVE_SOL_MINTS.has(change.mint)
    || (change.amount < 0
      ? !suppressOut && unwrapAccountFundingSol === 0
      : !suppressIn && wrapAccountRefundSol === 0)
  );
  if ((suppressOut || unwrapAccountFundingSol > 0) && independentNativeOut > 0) {
    balanceChanges.push({ mint: "SOL", amount: -independentNativeOut, decimals: 9 });
  }
  if ((suppressIn || wrapAccountRefundSol > 0) && independentNativeIn > 0) {
    balanceChanges.push({ mint: "SOL", amount: independentNativeIn, decimals: 9 });
  }

  const excludedNativeSolOut = suppressOut || unwrapAccountFundingSol > 0
    ? Math.max(0, nativeOut - independentNativeOut)
    : 0;
  const excludedNativeSolIn = suppressIn || wrapAccountRefundSol > 0
    ? Math.max(0, nativeIn - independentNativeIn)
    : 0;
  const feeLamports = positiveNumber(input.feeLamports);
  return {
    balanceChanges,
    normalization: {
      wrappedSolAmount,
      unwrappedSolAmount,
      excludedNativeSolOut,
      excludedNativeSolIn,
      ancillaryNativeSolOut: Math.max(0, excludedNativeSolOut - wrappedSolAmount),
      ancillaryNativeSolIn: Math.max(0, excludedNativeSolIn - unwrappedSolAmount),
      ...(feeLamports === undefined ? {} : { networkFeeSol: feeLamports / LAMPORTS_PER_SOL }),
    },
  };
}
