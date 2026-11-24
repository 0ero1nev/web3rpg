import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildWalletProfile,
  WalletAnalysisError,
} from "@/lib/analysis/buildWalletProfile";
import type {
  WalletAnalysisErrorCode,
  WalletProfile,
} from "@/lib/analysis/types";
import { isValidSolanaPublicKey } from "@/lib/security/publicAnalysis";

export const runtime = "nodejs";
export const INTERNAL_ANALYZER_CONTRACT_VERSION = "v1" as const;

type InternalErrorCode =
  | WalletAnalysisErrorCode
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "SERVICE_MISCONFIGURED";

type InternalAnalyzerSuccess = {
  contractVersion: typeof INTERNAL_ANALYZER_CONTRACT_VERSION;
  profile: WalletProfile;
};

type InternalAnalyzerError = {
  contractVersion: typeof INTERNAL_ANALYZER_CONTRACT_VERSION;
  error: {
    code: InternalErrorCode;
    message: string;
  };
};

const requestSchema = z.object({
  walletAddress: z.string().refine(isValidSolanaPublicKey),
  contractVersion: z.string(),
}).strict();

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(code: InternalErrorCode, message: string, status: number) {
  return NextResponse.json<InternalAnalyzerError>(
    {
      contractVersion: INTERNAL_ANALYZER_CONTRACT_VERSION,
      error: { code, message },
    },
    { status, headers: responseHeaders },
  );
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

/**
 * Hash both values before comparing so timingSafeEqual never exposes a length
 * mismatch. Authentication headers and token values are never logged.
 */
function validServiceToken(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function statusFor(code: WalletAnalysisErrorCode): number {
  switch (code) {
    case "INVALID_ADDRESS": return 400;
    case "NO_HISTORY": return 404;
    case "RATE_LIMITED": return 429;
    case "UPSTREAM_RATE_LIMITED":
    case "SERVER_BUSY": return 503;
    case "PARTIAL_HISTORY": return 206;
    default: return 502;
  }
}

function safeMessage(code: WalletAnalysisErrorCode): string {
  switch (code) {
    case "INVALID_ADDRESS": return "The wallet address is invalid.";
    case "NO_HISTORY": return "No transaction history was found for this wallet.";
    case "RATE_LIMITED": return "The analysis request was rate limited.";
    case "UPSTREAM_RATE_LIMITED": return "The wallet data provider is temporarily rate limited.";
    case "SERVER_BUSY": return "The wallet analyzer is currently at capacity.";
    case "PARTIAL_HISTORY": return "The wallet history is partial.";
    default: return "Wallet analysis is temporarily unavailable.";
  }
}

type AnalyzeWallet = (address: string) => Promise<WalletProfile>;

/** Exported dependency seam keeps route tests deterministic and offline. */
export async function handleInternalAnalyzeWallet(
  request: Request,
  analyze: AnalyzeWallet = buildWalletProfile,
) {
  const configuredToken = process.env.ANALYZER_SERVICE_TOKEN?.trim();
  if (!configuredToken) {
    return errorResponse(
      "SERVICE_MISCONFIGURED",
      "Internal analyzer authentication is not configured.",
      503,
    );
  }

  if (!validServiceToken(bearerToken(request), configuredToken)) {
    return errorResponse("UNAUTHORIZED", "Unauthorized.", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", "Request body is invalid.", 400);
  }
  if (parsed.data.contractVersion !== INTERNAL_ANALYZER_CONTRACT_VERSION) {
    return errorResponse(
      "UNSUPPORTED_CONTRACT_VERSION",
      `Supported contract version is ${INTERNAL_ANALYZER_CONTRACT_VERSION}.`,
      400,
    );
  }

  try {
    const profile = await analyze(parsed.data.walletAddress);
    return NextResponse.json<InternalAnalyzerSuccess>(
      {
        contractVersion: INTERNAL_ANALYZER_CONTRACT_VERSION,
        profile,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof WalletAnalysisError) {
      return errorResponse(error.code, safeMessage(error.code), statusFor(error.code));
    }
    return errorResponse("PROVIDER_ERROR", safeMessage("PROVIDER_ERROR"), 502);
  }
}

export async function POST(request: Request) {
  return handleInternalAnalyzeWallet(request);
}
