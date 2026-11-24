from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from langgraph.errors import GraphRecursionError

from app.core.config import Settings
from app.graph.workflow import run_workflow
from app.schemas.agent import ChatRequest, ChatResponse


router = APIRouter(prefix="/api/v1/agent", tags=["agent"])


def _limitations(state: dict[str, Any]) -> list[str]:
    analysis = state.get("analysis")
    if analysis is None:
        return []
    quality = analysis.data_quality
    limitations: list[str] = []
    if not quality.history_complete:
        limitations.append("Wallet history reached the configured analysis window and is partial.")
    if quality.historical_pricing_status != "OK":
        limitations.append(
            f"Historical pricing coverage is {quality.historical_pricing_status.lower()}."
        )
    if quality.pricing_coverage < 1:
        limitations.append(
            f"Current holding pricing coverage is {quality.pricing_coverage:.0%}."
        )
    return limitations


@router.post("/chat", response_model=ChatResponse, response_model_by_alias=True)
async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
    workflow = request.app.state.workflow
    settings: Settings = request.app.state.settings
    try:
        async with asyncio.timeout(settings.agent_request_timeout):
            state = await run_workflow(
                workflow,
                payload,
                maximum_steps=settings.agent_max_graph_steps,
            )
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Agent request timed out.") from exc
    except GraphRecursionError as exc:
        raise HTTPException(status_code=503, detail="Agent step limit exceeded.") from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analysis = state.get("analysis")
    return ChatResponse(
        request_id=uuid4(),
        wallet_address=payload.wallet_address,
        answer=state.get("answer") or "I could not generate a response.",
        analysis_used=analysis is not None,
        tool_calls=state.get("tool_calls", 0),
        persona_result=analysis.persona_result if analysis else None,
        data_quality=analysis.data_quality if analysis else None,
        limitations=_limitations(state),
        metadata={
            "contractVersion": analysis.contract_version if analysis else None,
            "analysisError": state.get("analysis_error"),
        },
    )
