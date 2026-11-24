import { NextResponse } from "next/server";
import {
  buildWalletProfile,
  WalletAnalysisError,
} from "@/lib/analysis/buildWalletProfile";
import type {
  WalletAnalysisErrorCode,
  WalletAnalysisErrorResponse,
} from "@/lib/analysis/types";
import type { WalletAnalysisFeedEvent, WalletAnalysisProgressEvent } from "@/lib/analysis/progress";
import {
  allowedAnalysisOrigin,
  AnalysisCapacityError,
  analysisCorsHeaders,
  checkAnalysisRateLimit,
  isValidSolanaPublicKey,
  logAnalysisSecurityEvent,
  PublicRequestError,
  readPublicAnalysisRequest,
} from "@/lib/security/publicAnalysis";

export const runtime = "nodejs";
export { isValidSolanaPublicKey };

function errorStatus(code: WalletAnalysisErrorCode): number {
  switch (code) {
    case "INVALID_ADDRESS": return 400;
    case "NO_HISTORY": return 404;
    case "RATE_LIMITED": return 429;
    case "UPSTREAM_RATE_LIMITED": return 503;
    case "SERVER_BUSY": return 503;
    case "PARTIAL_HISTORY": return 206;
    default: return 502;
  }
}

function publicErrorMessage(code: WalletAnalysisErrorCode): string {
  switch (code) {
    case "INVALID_ADDRESS": return "Address must be a valid Solana public key.";
    case "NO_HISTORY": return "No transaction history was found for this wallet.";
    case "RATE_LIMITED": return "Too many analysis requests. Please try again later.";
    case "UPSTREAM_RATE_LIMITED": return "Helius rejected the wallet data request (HTTP 429). Check this API key's limits, then try again.";
    case "SERVER_BUSY": return "Wallet analysis is busy. Please try again shortly.";
    case "PARTIAL_HISTORY": return "Wallet history is partial.";
    default: return "Wallet analysis is temporarily unavailable.";
  }
}

function errorResponse(
  code: WalletAnalysisErrorCode,
  corsOrigin: string | null,
  init: { status?: number; headers?: HeadersInit; message?: string } = {},
) {
  return NextResponse.json<WalletAnalysisErrorResponse>(
    { code, message: init.message ?? publicErrorMessage(code) },
    {
      status: init.status ?? errorStatus(code),
      headers: { ...analysisCorsHeaders(corsOrigin), "Cache-Control": "no-store", ...init.headers },
    },
  );
}

function publicFailureCode(error: unknown): WalletAnalysisErrorCode {
  if (error instanceof AnalysisCapacityError) return "SERVER_BUSY";
  if (error instanceof WalletAnalysisError) return error.code;
  return "PROVIDER_ERROR";
}

export function OPTIONS(request: Request) {
  const origin = allowedAnalysisOrigin(request);
  if (origin === false) {
    logAnalysisSecurityEvent("origin_rejected", request);
    return new Response(null, { status: 403, headers: analysisCorsHeaders(null) });
  }
  return new Response(null, { status: 204, headers: analysisCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = allowedAnalysisOrigin(request);
  if (origin === false) {
    logAnalysisSecurityEvent("origin_rejected", request);
    return errorResponse("INVALID_ADDRESS", null, { status: 403, message: "Origin is not allowed." });
  }

  const rateLimit = checkAnalysisRateLimit(request);
  if (!rateLimit.allowed) {
    logAnalysisSecurityEvent("rate_limited", request);
    return errorResponse("RATE_LIMITED", origin, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  let address: string;
  let progress: boolean;
  try {
    ({ address, progress = false } = await readPublicAnalysisRequest(request));
  } catch (error) {
    if (error instanceof PublicRequestError) {
      logAnalysisSecurityEvent("body_rejected", request, error.reason);
      return errorResponse("INVALID_ADDRESS", origin, { status: error.status, message: error.message });
    }
    return errorResponse("INVALID_ADDRESS", origin, { message: "Request body must be valid JSON." });
  }

  if (progress) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (value: unknown) => {
          if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        };
        request.signal.addEventListener("abort", () => {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }, { once: true });
        void (async () => {
          try {
            const profile = await buildWalletProfile(address, {
              onProgress: (stage) => send({ type: "progress", stage } satisfies WalletAnalysisProgressEvent),
              onEvent: (message) => send({ type: "analysis_event", message } satisfies WalletAnalysisFeedEvent),
            });
            send({ type: "result", profile });
          } catch (error) {
            const code = publicFailureCode(error);
            if (code === "SERVER_BUSY") logAnalysisSecurityEvent("capacity_rejected", request);
            else if (code === "PROVIDER_ERROR") logAnalysisSecurityEvent("provider_failure", request, "analysis_provider");
            send({ type: "error", code, message: publicErrorMessage(code) });
          } finally {
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        })();
      },
    });
    return new Response(stream, {
      headers: {
        ...analysisCorsHeaders(origin),
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const profile = await buildWalletProfile(address);
    if (!profile.dataQuality.historyComplete) {
      return NextResponse.json<WalletAnalysisErrorResponse>(
        {
          code: "PARTIAL_HISTORY",
          message: `History reached the configured limit of ${profile.analyzedTransactionCount} transactions.`,
          profile,
        },
        { status: 206, headers: { ...analysisCorsHeaders(origin), "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(profile, {
      headers: { ...analysisCorsHeaders(origin), "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = publicFailureCode(error);
    if (code === "SERVER_BUSY") logAnalysisSecurityEvent("capacity_rejected", request);
    else if (code === "PROVIDER_ERROR") logAnalysisSecurityEvent("provider_failure", request, "analysis_provider");
    return errorResponse(code, origin);
  }
}
