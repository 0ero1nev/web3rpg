from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="allow",
    )


class PersonaEvidence(CamelModel):
    label: str
    value: str


class PersonaMetric(CamelModel):
    label: str
    display_value: str
    normalized_value: float | None = None


class NormalPersonaResult(CamelModel):
    kind: Literal["NORMAL_PERSONA"]
    id: str
    name: str
    subtitle: str
    artwork: str
    persona_id: str
    match: float
    rarity: str
    confidence: float
    metrics: list[PersonaMetric]
    evidence: list[PersonaEvidence]
    quote: list[str]
    story: list[str]


class SpecialPersonaResult(CamelModel):
    kind: Literal["SPECIAL_PERSONA"]
    id: str
    name: str
    subtitle: str
    artwork: str
    persona_id: Literal["diogenes"]
    reason: Literal["INSUFFICIENT_HISTORY"]
    qualifying_swaps: int
    metrics: list[PersonaMetric]
    quote: list[str]


class InconclusivePersonaResult(CamelModel):
    kind: Literal["INCONCLUSIVE"]
    reason: Literal[
        "NO_ELIGIBLE_PERSONA",
        "NO_STRONG_MATCH",
        "HISTORICAL_PRICING_UNAVAILABLE",
    ]
    qualifying_swaps: int


PersonaResult = Annotated[
    NormalPersonaResult | SpecialPersonaResult | InconclusivePersonaResult,
    Field(discriminator="kind"),
]


class HistoricalPricingDiagnostics(CamelModel):
    status: Literal["OK", "PARTIAL", "UNAVAILABLE"]
    requested_timestamp_count: int
    resolved_timestamp_count: int
    requested_bucket_count: int
    resolved_bucket_count: int
    coinbase_request_count: int
    coinbase_failure_count: int
    coingecko_request_count: int
    coingecko_failure_count: int
    failure_categories: dict[str, int] | None = None


class ValuationSummary(CamelModel):
    qualifying_swap_count: int
    valued_swap_count: int
    swap_valuation_coverage: float
    source_counts: dict[str, int]
    historical_pricing: HistoricalPricingDiagnostics


class DataQuality(CamelModel):
    history_complete: bool
    pricing_coverage: float = Field(ge=0, le=1)
    confidence: Literal["LOW", "MEDIUM", "HIGH"]
    historical_pricing_status: Literal["OK", "PARTIAL", "UNAVAILABLE"]
    degraded_reasons: list[Literal["HISTORICAL_PRICING_UNAVAILABLE"]]


class WalletProfile(CamelModel):
    address: str
    wallet_value_usd: float | None = None
    transaction_count: int = Field(ge=0)
    analyzed_transaction_count: int = Field(ge=0)
    first_activity_at: int | None = None
    last_activity_at: int | None = None
    holdings: list[dict[str, Any]]
    transactions: list[dict[str, Any]]
    valuation_summary: ValuationSummary | None = None
    position_performance: dict[str, Any] | None = None
    trade_sequences: dict[str, Any] | None = None
    persona_ranking: dict[str, Any] | None = None
    persona_outcome: dict[str, Any] | None = None
    persona_result: PersonaResult | None = None
    price_validation: dict[str, Any] | None = None
    position_telemetry: dict[str, Any] | None = None
    data_quality: DataQuality


class InternalAnalyzerResponse(CamelModel):
    contract_version: Literal["v1"]
    profile: WalletProfile


class InternalAnalyzerErrorDetail(CamelModel):
    code: str
    message: str


class InternalAnalyzerErrorResponse(CamelModel):
    contract_version: Literal["v1"]
    error: InternalAnalyzerErrorDetail


class WalletToolResult(CamelModel):
    """Only values directly present in the v1 WalletProfile contract."""

    contract_version: Literal["v1"] = "v1"
    wallet_address: str
    wallet_value_usd: float | None = None
    persona_result: PersonaResult | None = None
    persona_ranking: dict[str, Any] | None = None
    position_telemetry: dict[str, Any] | None = None
    valuation_summary: ValuationSummary | None = None
    position_performance: dict[str, Any] | None = None
    trade_sequences: dict[str, Any] | None = None
    data_quality: DataQuality
