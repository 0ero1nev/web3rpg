import pytest

from app.schemas.wallet import WalletProfile
from app.tools.wallet_tools import analyze_wallet
from conftest import wallet_profile_payload


class FakeAnalyzer:
    def __init__(self) -> None:
        self.addresses: list[str] = []

    async def analyze_wallet(self, wallet_address: str) -> WalletProfile:
        self.addresses.append(wallet_address)
        return WalletProfile.model_validate(wallet_profile_payload())


@pytest.mark.asyncio
async def test_tool_returns_only_real_profile_fields() -> None:
    analyzer = FakeAnalyzer()
    result = await analyze_wallet("11111111111111111111111111111111", analyzer)
    assert analyzer.addresses == ["11111111111111111111111111111111"]
    assert result.persona_result is not None
    assert result.persona_result.persona_id == "don_quixote"
    assert result.persona_result.evidence[0].value == "120d"
    assert result.data_quality.pricing_coverage == 1
