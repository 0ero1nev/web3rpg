const BRIDGE_PATH = "/__web3rpg/pricing-bridge";
const MAX_BODY_BYTES = 8_192;
const MAX_RANGE_SECONDS = 14 * 24 * 60 * 60;

function safeFailureCategory(error) {
  const code = `${error?.code ?? ""} ${error?.cause?.code ?? ""}`.toUpperCase();
  const message = `${error?.name ?? ""} ${error?.message ?? ""} ${error?.cause?.message ?? ""}`.toLowerCase();
  if (error?.name === "TimeoutError" || error?.name === "AbortError" || message.includes("timeout")) return "TIMEOUT";
  if (code.includes("ENOTFOUND") || code.includes("EAI_AGAIN")) return "DNS";
  if (code.includes("ECONNREFUSED") || message.includes("proxy")) return "PROXY_CONNECTION";
  if (code.includes("CERT") || code.includes("TLS") || message.includes("certificate")) return "TLS";
  return "NETWORK_OTHER";
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  }
  return JSON.parse(body);
}

function validRange(from, to) {
  return Number.isFinite(from)
    && Number.isFinite(to)
    && from > 0
    && to >= from
    && to - from <= MAX_RANGE_SECONDS;
}

export function pricingBridge({ coinGeckoApiKey } = {}) {
  return {
    name: "web3rpg-local-pricing-bridge",
    configureServer(server) {
      server.middlewares.use(BRIDGE_PATH, async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("Method Not Allowed");
          return;
        }
        try {
          const { provider, from, to } = await readBody(request);
          if (!validRange(from, to) || (provider !== "coinbase" && provider !== "coingecko")) {
            response.statusCode = 400;
            response.end("Invalid pricing request");
            return;
          }

          let upstreamUrl;
          let headers;
          if (provider === "coinbase") {
            upstreamUrl = new URL("https://api.exchange.coinbase.com/products/SOL-USD/candles");
            upstreamUrl.searchParams.set("granularity", "3600");
            upstreamUrl.searchParams.set("start", new Date(from * 1000).toISOString());
            upstreamUrl.searchParams.set("end", new Date(Math.min(to, Date.now() / 1000) * 1000).toISOString());
            headers = { "User-Agent": "web3rpg-wallet-analysis/1.0" };
          } else {
            upstreamUrl = new URL("https://api.coingecko.com/api/v3/coins/solana/market_chart/range");
            upstreamUrl.searchParams.set("vs_currency", "usd");
            upstreamUrl.searchParams.set("from", String(from));
            upstreamUrl.searchParams.set("to", String(to));
            upstreamUrl.searchParams.set("interval", "hourly");
            headers = coinGeckoApiKey ? { "x-cg-demo-api-key": coinGeckoApiKey } : undefined;
          }

          const startedAt = Date.now();
          const upstream = await fetch(upstreamUrl, {
            headers,
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          response.statusCode = upstream.status;
          response.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
          response.setHeader("x-pricing-executor", "local-node-bridge");
          response.setHeader("x-pricing-node-use-env-proxy", process.env.NODE_USE_ENV_PROXY ?? "");
          response.setHeader("x-pricing-http-proxy-available", String(Boolean(process.env.HTTP_PROXY)));
          response.setHeader("x-pricing-https-proxy-available", String(Boolean(process.env.HTTPS_PROXY)));
          response.setHeader("x-pricing-no-proxy-available", String(Boolean(process.env.NO_PROXY)));
          response.setHeader("x-pricing-elapsed-ms", String(Date.now() - startedAt));
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          response.statusCode = 502;
          response.setHeader("content-type", "application/json");
          response.setHeader("x-pricing-executor", "local-node-bridge");
          response.setHeader("x-pricing-failure-category", safeFailureCategory(error));
          response.setHeader("x-pricing-node-use-env-proxy", process.env.NODE_USE_ENV_PROXY ?? "");
          response.setHeader("x-pricing-http-proxy-available", String(Boolean(process.env.HTTP_PROXY)));
          response.setHeader("x-pricing-https-proxy-available", String(Boolean(process.env.HTTPS_PROXY)));
          response.setHeader("x-pricing-no-proxy-available", String(Boolean(process.env.NO_PROXY)));
          response.end(JSON.stringify({ error: "PRICING_UPSTREAM_UNAVAILABLE" }));
        }
      });
    },
  };
}

export const LOCAL_PRICING_BRIDGE_PATH = BRIDGE_PATH;
