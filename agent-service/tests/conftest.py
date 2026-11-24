from __future__ import annotations

from pydantic import SecretStr

from app.core.config import Settings


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "analyzer_base_url": "http://analyzer.test",
        "analyzer_service_token": SecretStr("test-service-token"),
        "analyzer_timeout": 2.0,
        "openai_api_key": SecretStr("test-openai-key"),
        "openai_model": "test-model",
        "openai_timeout": 2.0,
        "model_retries": 0,
        "agent_request_timeout": 5.0,
        "agent_max_tool_calls": 1,
        "agent_max_graph_steps": 8,
    }
    values.update(overrides)
    return Settings(**values)


def wallet_profile_payload(
    *,
    history_complete: bool = True,
    pricing_coverage: float = 1.0,
    pricing_status: str = "OK",
) -> dict[str, object]:
    return {
        "address": "11111111111111111111111111111111",
        "transactionCount": 20,
        "analyzedTransactionCount": 20,
        "holdings": [],
        "transactions": [],
        "personaResult": {
            "kind": "NORMAL_PERSONA",
            "id": "don-quixote",
            "name": "DON QUIXOTE",
            "subtitle": "THE BAG BELIEVER",
            "artwork": "/personas/don-quixote.png",
            "personaId": "don_quixote",
            "match": 77,
            "rarity": "RARE",
            "confidence": 84,
            "metrics": [{"label": "CONVICTION", "displayValue": "91"}],
            "evidence": [{"label": "Long-held losing position", "value": "120d"}],
            "quote": ["Others see a dead token."],
            "story": ["Others see a dead token."],
        },
        "dataQuality": {
            "historyComplete": history_complete,
            "pricingCoverage": pricing_coverage,
            "confidence": "HIGH" if history_complete else "LOW",
            "historicalPricingStatus": pricing_status,
            "degradedReasons": (
                ["HISTORICAL_PRICING_UNAVAILABLE"]
                if pricing_status == "UNAVAILABLE"
                else []
            ),
        },
    }
