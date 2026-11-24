from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.wallet import DataQuality, PersonaResult


_BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def is_solana_public_key(value: str) -> bool:
    if not 32 <= len(value) <= 44 or value != value.strip():
        return False
    number = 0
    for character in value:
        digit = _BASE58.find(character)
        if digit < 0:
            return False
        number = number * 58 + digit
    byte_count = (number.bit_length() + 7) // 8 if number else 0
    leading_zeroes = len(value) - len(value.lstrip("1"))
    return byte_count + leading_zeroes == 32


class ChatRequest(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: value.split("_")[0] + "".join(part.capitalize() for part in value.split("_")[1:]), populate_by_name=True, extra="forbid")

    wallet_address: str
    message: str = Field(min_length=1, max_length=4_000)

    @field_validator("wallet_address")
    @classmethod
    def validate_wallet(cls, value: str) -> str:
        if not is_solana_public_key(value):
            raise ValueError("walletAddress must be a valid Solana public key")
        return value

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message cannot be blank")
        return stripped


class ChatResponse(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: value.split("_")[0] + "".join(part.capitalize() for part in value.split("_")[1:]), populate_by_name=True)

    request_id: UUID
    wallet_address: str
    answer: str
    analysis_used: bool
    tool_calls: int
    persona_result: PersonaResult | None = None
    data_quality: DataQuality | None = None
    limitations: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
