import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function integerSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function analysisSecurityConfig() {
  return {
    maxBodyBytes: integerSetting("ANALYSIS_MAX_BODY_BYTES", 1_024, 128, 16_384),
    rateLimitMax: integerSetting("ANALYSIS_RATE_LIMIT_MAX", 10, 1, 10_000),
    rateLimitWindowMs: integerSetting("ANALYSIS_RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 86_400_000),
    maxColdConcurrency: integerSetting("ANALYSIS_MAX_COLD_CONCURRENCY", 3, 1, 100),
    maxColdQueue: integerSetting("ANALYSIS_MAX_COLD_QUEUE", 24, 0, 10_000),
  };
}

function decodeBase58(value: string): Uint8Array | null {
  if (!value || value.length > 44) return null;
  let number = BigInt(0);
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return null;
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
  return Uint8Array.from(bytes.reverse());
}

export function isValidSolanaPublicKey(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length >= 32
    && decodeBase58(value)?.length === 32;
}

const analysisRequestSchema = z.object({
  address: z.string().min(32).max(44).refine(isValidSolanaPublicKey),
  progress: z.boolean().optional(),
}).strict();

export type PublicAnalysisRequest = z.infer<typeof analysisRequestSchema>;

export class PublicRequestError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    public readonly reason: "INVALID_JSON" | "INVALID_SCHEMA" | "BODY_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE",
    message: string,
  ) {
    super(message);
    this.name = "PublicRequestError";
  }
}

export async function readPublicAnalysisRequest(request: Request): Promise<PublicAnalysisRequest> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new PublicRequestError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  const maximum = analysisSecurityConfig().maxBodyBytes;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new PublicRequestError(413, "BODY_TOO_LARGE", "Request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new PublicRequestError(400, "INVALID_JSON", "Request body must be valid JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new PublicRequestError(413, "BODY_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PublicRequestError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = analysisRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new PublicRequestError(
      400,
      "INVALID_SCHEMA",
      "Request must contain only a valid Solana address and an optional boolean progress flag.",
    );
  }
  return parsed.data;
}

type RateLimitEntry = { count: number; resetAt: number };
const securityGlobal = globalThis as typeof globalThis & {
  __web3rpgAnalysisRateLimits?: Map<string, RateLimitEntry>;
  __web3rpgAnalysisLogSalt?: string;
  __web3rpgColdAnalysisState?: { active: number; queue: Array<{ resolve: () => void }> };
};
const rateLimits = securityGlobal.__web3rpgAnalysisRateLimits ??= new Map<string, RateLimitEntry>();
const logSalt = securityGlobal.__web3rpgAnalysisLogSalt ??= randomBytes(16).toString("hex");
const coldState = securityGlobal.__web3rpgColdAnalysisState ??= { active: 0, queue: [] };

function clientIdentity(request: Request): string {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  if (process.env.ANALYSIS_TRUST_X_FORWARDED_FOR === "1") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "unknown";
}

function identityTag(identity: string): string {
  return createHash("sha256").update(logSalt).update(identity).digest("hex").slice(0, 12);
}

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number; identityTag: string };

export function checkAnalysisRateLimit(request: Request, now = Date.now()): RateLimitDecision {
  const identity = clientIdentity(request);
  // The dev server is used for repeated wallet debugging. A built preview and
  // deployed app still enforce the configured limit.
  if (process.env.NODE_ENV === "development") {
    return { allowed: true, retryAfterSeconds: 0, identityTag: identityTag(identity) };
  }
  const { rateLimitMax, rateLimitWindowMs } = analysisSecurityConfig();
  const existing = rateLimits.get(identity);
  const entry = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + rateLimitWindowMs }
    : existing;
  entry.count += 1;
  rateLimits.set(identity, entry);
  if (rateLimits.size > 10_000) {
    for (const [key, candidate] of rateLimits) {
      if (candidate.resetAt <= now) rateLimits.delete(key);
      if (rateLimits.size <= 8_000) break;
    }
    while (rateLimits.size > 8_000) {
      const oldest = rateLimits.keys().next().value as string | undefined;
      if (!oldest) break;
      rateLimits.delete(oldest);
    }
  }
  return {
    allowed: entry.count <= rateLimitMax,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    identityTag: identityTag(identity),
  };
}

export function logAnalysisSecurityEvent(
  event: "rate_limited" | "body_rejected" | "origin_rejected" | "capacity_rejected" | "provider_failure",
  request: Request,
  detail?: string,
) {
  console.warn("[public-analysis] security event", {
    event,
    client: identityTag(clientIdentity(request)),
    ...(detail ? { detail } : {}),
  });
}

export function allowedAnalysisOrigin(request: Request): string | null | false {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let normalized: string;
  try { normalized = new URL(origin).origin; } catch { return false; }
  const configured = (process.env.ANALYSIS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try { return [new URL(value).origin]; } catch { return []; }
    });
  const requestOrigin = new URL(request.url).origin;
  return normalized === requestOrigin || configured.includes(normalized) ? normalized : false;
}

export function analysisCorsHeaders(allowedOrigin: string | null): HeadersInit {
  return {
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    ...(allowedOrigin ? {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    } : {}),
  };
}

export class AnalysisCapacityError extends Error {
  constructor() {
    super("Cold analysis capacity is full.");
    this.name = "AnalysisCapacityError";
  }
}

function releaseColdAnalysisSlot() {
  const next = coldState.queue.shift();
  if (next) next.resolve();
  else coldState.active -= 1;
}

export async function runWithColdAnalysisSlot<T>(work: () => Promise<T>): Promise<T> {
  const { maxColdConcurrency, maxColdQueue } = analysisSecurityConfig();
  if (coldState.active < maxColdConcurrency) {
    coldState.active += 1;
  } else {
    if (coldState.queue.length >= maxColdQueue) throw new AnalysisCapacityError();
    await new Promise<void>((resolve) => coldState.queue.push({ resolve }));
  }
  try { return await work(); } finally { releaseColdAnalysisSlot(); }
}

export const __publicAnalysisTestHooks = {
  resetRateLimits() { rateLimits.clear(); },
  resetColdState() { coldState.active = 0; coldState.queue.length = 0; },
  coldState() { return { active: coldState.active, queued: coldState.queue.length }; },
};
