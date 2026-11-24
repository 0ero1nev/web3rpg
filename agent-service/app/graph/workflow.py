from __future__ import annotations

import json
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.clients.analyzer_client import AnalyzerClientError, safe_analyzer_error
from app.clients.openai_client import WalletReasoningModel
from app.core.config import Settings
from app.graph.state import AgentState
from app.schemas.agent import ChatRequest, is_solana_public_key
from app.tools.wallet_tools import WalletAnalyzer, analyze_wallet


def _step(state: AgentState) -> int:
    return state.get("graph_steps", 0) + 1


def build_workflow(
    *,
    model: WalletReasoningModel,
    analyzer: WalletAnalyzer,
    settings: Settings,
):
    async def validate_input(state: AgentState) -> dict[str, Any]:
        request = state["request"]
        if not is_solana_public_key(request.wallet_address):
            raise ValueError("Invalid Solana wallet address.")
        return {
            "graph_steps": _step(state),
            "tool_calls": 0,
            "analysis": None,
            "analysis_error": None,
            "model_messages": [{
                "role": "user",
                "content": [{
                    "type": "input_text",
                    "text": (
                        f"Wallet: {request.wallet_address}\n"
                        f"Question: {request.message}"
                    ),
                }],
            }],
        }

    async def agent(state: AgentState) -> dict[str, Any]:
        decision = await model.decide(state["model_messages"])
        messages = list(state["model_messages"])
        if decision.response_items:
            messages.extend(decision.response_items)
        return {
            "graph_steps": _step(state),
            "model_messages": messages,
            "pending_tool_call": decision.tool_call,
            "answer": decision.text,
        }

    def route_after_agent(state: AgentState) -> str:
        return "tools" if state.get("pending_tool_call") is not None else "generate_response"

    async def tools(state: AgentState) -> dict[str, Any]:
        call = state.get("pending_tool_call")
        request = state["request"]
        if call is None:
            raise RuntimeError("Tool node reached without a pending tool call.")
        if call.name != "analyze_wallet":
            raise ValueError("The model requested an unsupported tool.")
        if state.get("tool_calls", 0) >= settings.agent_max_tool_calls:
            raise RuntimeError("Maximum wallet-analysis tool calls exceeded.")
        requested_wallet = call.arguments.get("wallet_address")
        if requested_wallet != request.wallet_address:
            raise ValueError("The tool may analyze only the wallet in the request.")

        analysis = None
        analysis_error = None
        try:
            analysis = await analyze_wallet(request.wallet_address, analyzer)
            output = analysis.model_dump(by_alias=True, mode="json")
        except AnalyzerClientError as error:
            analysis_error = safe_analyzer_error(error)
            output = {"error": analysis_error}

        messages = [
            *state["model_messages"],
            {
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": json.dumps(output, separators=(",", ":")),
            },
        ]
        return {
            "graph_steps": _step(state),
            "model_messages": messages,
            "pending_tool_call": None,
            "analysis": analysis,
            "analysis_error": analysis_error,
            "tool_calls": state.get("tool_calls", 0) + 1,
        }

    async def generate_response(state: AgentState) -> dict[str, Any]:
        answer = state.get("answer")
        if not answer:
            if state.get("analysis_error"):
                answer = "I could not complete the wallet analysis. Please try again later."
            else:
                answer = "I could not generate a response."
        return {"graph_steps": _step(state), "answer": answer}

    graph = StateGraph(AgentState)
    graph.add_node("validate_input", validate_input)
    graph.add_node("agent", agent)
    graph.add_node("tools", tools)
    graph.add_node("generate_response", generate_response)
    graph.add_edge(START, "validate_input")
    graph.add_edge("validate_input", "agent")
    graph.add_conditional_edges(
        "agent",
        route_after_agent,
        {"tools": "tools", "generate_response": "generate_response"},
    )
    graph.add_edge("tools", "agent")
    graph.add_edge("generate_response", END)
    return graph.compile()


async def run_workflow(
    workflow: Any,
    request: ChatRequest,
    *,
    maximum_steps: int,
) -> AgentState:
    return await workflow.ainvoke(
        {"request": request},
        config={"recursion_limit": maximum_steps},
    )
