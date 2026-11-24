import pytest
from pydantic import ValidationError

from app.schemas.agent import ChatRequest
from app.schemas.wallet import InternalAnalyzerResponse
from conftest import wallet_profile_payload


def test_invalid_wallet_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(walletAddress="not-a-wallet", message="Explain this wallet")


def test_partial_history_and_missing_price_coverage_are_preserved() -> None:
    payload = InternalAnalyzerResponse.model_validate({
        "contractVersion": "v1",
        "profile": wallet_profile_payload(
            history_complete=False,
            pricing_coverage=0.35,
            pricing_status="UNAVAILABLE",
        ),
    })
    assert payload.profile.data_quality.history_complete is False
    assert payload.profile.data_quality.pricing_coverage == 0.35
    assert payload.profile.data_quality.historical_pricing_status == "UNAVAILABLE"
    assert payload.profile.data_quality.degraded_reasons == [
        "HISTORICAL_PRICING_UNAVAILABLE"
    ]


def test_unknown_contract_version_is_rejected() -> None:
    with pytest.raises(ValidationError):
        InternalAnalyzerResponse.model_validate({
            "contractVersion": "v2",
            "profile": wallet_profile_payload(),
        })
