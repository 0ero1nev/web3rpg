from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.chat import router
from app.graph.state import ModelDecision, ToolCall
from app.graph.workflow import build_workflow
from app.schemas.wallet import WalletProfile
from conftest import make_settings, wallet_profile_payload


class Model:
    def __init__(self) -> None:
        self.calls = 0

    async def decide(self, _: list[dict[str, Any]]) -> ModelDecision:
        self.calls += 1
        if self.calls == 1:
            return ModelDecision(tool_call=ToolCall(
                call_id="api_call",
                name="analyze_wallet",
                arguments={"wallet_address": "11111111111111111111111111111111"},
            ))
        return ModelDecision(text="The result is based on a long-held losing position; pricing is incomplete.")


class Analyzer:
    async def analyze_wallet(self, _: str) -> WalletProfile:
        return WalletProfile.model_validate(wallet_profile_payload(
            history_complete=False,
            pricing_coverage=0.4,
            pricing_status="PARTIAL",
        ))


def test_chat_api_returns_structured_analysis_and_limitations() -> None:
    settings = make_settings()
    app = FastAPI()
    app.include_router(router)
    app.state.settings = settings
    app.state.workflow = build_workflow(
        model=Model(),
        analyzer=Analyzer(),
        settings=settings,
    )

    with TestClient(app) as client:
        response = client.post("/api/v1/agent/chat", json={
            "walletAddress": "11111111111111111111111111111111",
            "message": "Why this Persona?",
        })

    assert response.status_code == 200
    payload = response.json()
    assert payload["analysisUsed"] is True
    assert payload["toolCalls"] == 1
    assert payload["personaResult"]["personaId"] == "don_quixote"
    assert len(payload["limitations"]) == 3


def test_chat_api_rejects_invalid_wallet_before_model_execution() -> None:
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        response = client.post("/api/v1/agent/chat", json={
            "walletAddress": "invalid",
            "message": "Analyze this",
        })
    assert response.status_code == 422
