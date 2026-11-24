# Onchain Persona Agent Service

Independent Python 3.12+ service that lets an LLM call the existing,
deterministic TypeScript wallet analyzer through one fixed Tool. It does not
reimplement scoring, execute arbitrary URLs, or modify Java/PostgreSQL.

## Architecture

```text
POST /api/v1/agent/chat
  -> FastAPI validation
  -> LangGraph validate_input
  -> OpenAI Responses model
  -> analyze_wallet Tool (when wallet evidence is needed)
  -> HTTPX fixed internal endpoint client
  -> POST /api/internal/v1/analyze-wallet
  -> existing buildWalletProfile()
  -> model explains actual evidence and limitations
```

The graph is `START -> validate_input -> agent -> tools -> agent ->
generate_response -> END`; the tools branch is conditional. Tool calls, graph
steps, total request time, and model retries are bounded by environment values.

## Internal analyzer contract

```http
POST /api/internal/v1/analyze-wallet
Authorization: Bearer <ANALYZER_SERVICE_TOKEN>
Content-Type: application/json

{"walletAddress":"<Solana public key>","contractVersion":"v1"}
```

Success returns:

```json
{"contractVersion":"v1","profile":{"...":"existing WalletProfile"}}
```

Failure returns:

```json
{"contractVersion":"v1","error":{"code":"MACHINE_CODE","message":"Safe message"}}
```

The endpoint emits ordinary JSON, not browser NDJSON. It has no CORS-based
trust, sets `Cache-Control: no-store`, fails closed when its token is missing,
compares SHA-256 token digests with `timingSafeEqual`, and never logs credentials.
The profile is the real existing `WalletProfile`; fields that do not exist are
not invented.

## Agent chat contract

```http
POST /api/v1/agent/chat
Content-Type: application/json

{"walletAddress":"<Solana public key>","message":"Why was this wallet classified as Don Quixote?"}
```

Response fields are `requestId`, `walletAddress`, `answer`, `analysisUsed`,
`toolCalls`, optional `personaResult`, optional `dataQuality`, `limitations`,
and `metadata`. Partial history and incomplete historical/current price
coverage are surfaced in `limitations` and supplied to the model.

## Local setup

```bash
cd agent-service
python3.12 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
cp .env.example .env
```

Generate a strong random secret and configure the same value as
`ANALYZER_SERVICE_TOKEN` in the TypeScript service and this service. Configure
the existing analyzer provider keys, plus `OPENAI_API_KEY` here. Never commit
`.env` files.

Start the existing application normally, then:

```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health endpoints are `GET /health` and `GET /ready`.

## Tests

Python tests mock the analyzer transport and model and need no blockchain call:

```bash
.venv/bin/pytest
```

From the TypeScript project root:

```bash
npm run test:analyzer-routes
npm run build
```

## Deployment and authentication

Set `ANALYZER_SERVICE_TOKEN` through the Sites hosted runtime secret mechanism,
not source, `.openai/hosting.json`, logs, or client code. A private hosted Site
may additionally require its platform service-access credential in
`OAI-Sites-Authorization`; set it only as `ANALYZER_SITES_AUTH_TOKEN` in the
Agent. Platform access does not replace the dedicated analyzer Bearer token.

Use HTTPS and network restrictions where available. The analyzer host and path
are configuration constants; neither the user nor model can select an URL.
The service explains analysis, never performs trades, and never emits trading
signals or guaranteed-return claims.
