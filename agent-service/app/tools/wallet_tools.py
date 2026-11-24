from __future__ import annotations

from typing import Protocol

from app.schemas.wallet import WalletProfile, WalletToolResult


class WalletAnalyzer(Protocol):
    async def analyze_wallet(self, wallet_address: str) -> WalletProfile: ...


async def analyze_wallet(wallet_address: str, client: WalletAnalyzer) -> WalletToolResult:
    """Call only the configured analyzer; no arbitrary URL or code execution."""
    profile = await client.analyze_wallet(wallet_address)
    return WalletToolResult(
        wallet_address=profile.address,
        wallet_value_usd=profile.wallet_value_usd,
        persona_result=profile.persona_result,
        persona_ranking=profile.persona_ranking,
        position_telemetry=profile.position_telemetry,
        valuation_summary=profile.valuation_summary,
        position_performance=profile.position_performance,
        trade_sequences=profile.trade_sequences,
        data_quality=profile.data_quality,
    )
