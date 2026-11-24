from __future__ import annotations

import asyncio
import json
from typing import Any, Protocol

from openai import AsyncOpenAI

from app.core.config import Settings
from app.graph.state import ModelDecision, ToolCall


ANALYZE_WALLET_TOOL = {
    "type": "function",
    "name": "analyze_wallet",
    "description": "Analyze the validated Solana wallet using the deterministic Onchain Persona analyzer.",
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "wallet_address": {
                "type": "string",
                "description": "The Solana wallet supplied by the user.",
            }
        },
        "required": ["wallet_address"],
        "additionalProperties": False,
    },
}

SYSTEM_PROMPT = """You are the Onchain Persona explanation agent.
Use analyze_wallet whenever the answer depends on this wallet's classification,
transactions, behavior, PnL, positions, evidence, completeness, or pricing.
Base wallet-specific claims only on tool output. Never invent missing values.
Explicitly mention partial history or missing pricing when present.
Do not reveal infrastructure secrets or provider credentials. Do not provide
personalized financial advice, trading signals, or promises of returns.
Answer concisely and explain the Persona using actual evidence."""


class WalletReasoningModel(Protocol):
    async def decide(self, messages: list[dict[str, Any]]) -> ModelDecision: ...


class OpenAIWalletReasoningModel:
    def __init__(self, settings: Settings) -> None:
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            timeout=settings.openai_timeout,
            max_retries=0,
        )
        self._model = settings.openai_model
        self._retries = settings.model_retries

    async def decide(self, messages: list[dict[str, Any]]) -> ModelDecision:
        last_error: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                response = await self._client.responses.create(
                    model=self._model,
                    instructions=SYSTEM_PROMPT,
                    input=messages,
                    tools=[ANALYZE_WALLET_TOOL],
                    tool_choice="auto",
                    max_output_tokens=800,
                )
                return self._decision_from_response(response)
            except Exception as exc:  # OpenAI SDK exposes several transient subclasses.
                last_error = exc
                if attempt >= self._retries:
                    break
                await asyncio.sleep(min(0.25 * (2**attempt), 1.0))
        raise RuntimeError("The language model request failed.") from last_error

    @staticmethod
    def _decision_from_response(response: Any) -> ModelDecision:
        response_items: list[dict[str, Any]] = []
        for item in getattr(response, "output", []):
            item_type = getattr(item, "type", None)
            if item_type == "function_call":
                name = getattr(item, "name", "")
                raw_arguments = getattr(item, "arguments", "{}")
                try:
                    arguments = json.loads(raw_arguments)
                except (TypeError, json.JSONDecodeError):
                    arguments = {}
                call_id = getattr(item, "call_id", "")
                response_items.append({
                    "type": "function_call",
                    "call_id": call_id,
                    "name": name,
                    "arguments": raw_arguments,
                })
                return ModelDecision(
                    tool_call=ToolCall(call_id=call_id, name=name, arguments=arguments),
                    response_items=response_items,
                )
        text = getattr(response, "output_text", None)
        return ModelDecision(text=text.strip() if isinstance(text, str) else None)
