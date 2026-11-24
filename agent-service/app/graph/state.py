from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypedDict

from app.schemas.agent import ChatRequest
from app.schemas.wallet import WalletToolResult


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ModelDecision:
    text: str | None = None
    tool_call: ToolCall | None = None
    response_items: list[dict[str, Any]] | None = None


class AgentState(TypedDict, total=False):
    request: ChatRequest
    model_messages: list[dict[str, Any]]
    pending_tool_call: ToolCall | None
    analysis: WalletToolResult | None
    analysis_error: dict[str, Any] | None
    tool_calls: int
    graph_steps: int
    answer: str | None
