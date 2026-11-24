from __future__ import annotations

from typing import Any

import pytest

from app.graph.state import ModelDecision, ToolCall
from app.graph.workflow import build_workflow, run_workflow
from app.schemas.agent import ChatRequest
from app.schemas.wallet import WalletProfile
from conftest import make_settings, wallet_profile_payload


class SequencedModel:
    def __init__(self, decisions: list[ModelDecision]) -> None:
        self.decisions = decisions
        self.messages: list[list[dict[str, Any]]] = []

    async def decide(self, messages: list[dict[str, Any]]) -> ModelDecision:
        self.messages.append(messages)
        return self.decisions.pop(0)


class FakeAnalyzer:
    async def analyze_wallet(self, _: str) -> WalletProfile:
        return WalletProfile.model_validate(wallet_profile_payload())


@pytest.mark.asyncio
async def test_graph_calls_real_tool_boundary_then_explains_evidence() -> None:
    model = SequencedModel([
        ModelDecision(
            tool_call=ToolCall(
                call_id="call_1",
                name="analyze_wallet",
                arguments={"wallet_address": "11111111111111111111111111111111"},
            ),
            response_items=[{
                "type": "function_call",
                "call_id": "call_1",
                "name": "analyze_wallet",
                "arguments": '{"wallet_address":"11111111111111111111111111111111"}',
            }],
        ),
        ModelDecision(text="Don Quixote was selected because the analyzer found a 120-day long-held losing position."),
    ])
    settings = make_settings()
    workflow = build_workflow(model=model, analyzer=FakeAnalyzer(), settings=settings)
    state = await run_workflow(
        workflow,
        ChatRequest(
            walletAddress="11111111111111111111111111111111",
            message="Why was this wallet classified as Don Quixote?",
        ),
        maximum_steps=settings.agent_max_graph_steps,
    )
    assert state["tool_calls"] == 1
    assert state["analysis"].persona_result.persona_id == "don_quixote"
    assert "120-day" in state["answer"]
    assert "function_call_output" in str(model.messages[1])


@pytest.mark.asyncio
async def test_graph_can_answer_general_question_without_tool() -> None:
    model = SequencedModel([ModelDecision(text="A Persona is a behavioral archetype.")])
    settings = make_settings()
    workflow = build_workflow(model=model, analyzer=FakeAnalyzer(), settings=settings)
    state = await run_workflow(
        workflow,
        ChatRequest(
            walletAddress="11111111111111111111111111111111",
            message="What is an Onchain Persona?",
        ),
        maximum_steps=settings.agent_max_graph_steps,
    )
    assert state["tool_calls"] == 0
    assert state.get("analysis") is None


@pytest.mark.asyncio
async def test_graph_rejects_tool_call_for_a_different_wallet() -> None:
    model = SequencedModel([ModelDecision(tool_call=ToolCall(
        call_id="call_bad",
        name="analyze_wallet",
        arguments={"wallet_address": "So11111111111111111111111111111111111111112"},
    ))])
    settings = make_settings()
    workflow = build_workflow(model=model, analyzer=FakeAnalyzer(), settings=settings)
    with pytest.raises(ValueError, match="only the wallet"):
        await run_workflow(
            workflow,
            ChatRequest(
                walletAddress="11111111111111111111111111111111",
                message="Analyze this wallet",
            ),
            maximum_steps=settings.agent_max_graph_steps,
        )
