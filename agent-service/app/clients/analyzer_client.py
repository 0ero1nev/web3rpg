from __future__ import annotations

from enum import StrEnum
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.wallet import (
    InternalAnalyzerErrorResponse,
    InternalAnalyzerResponse,
    WalletProfile,
)


class AnalyzerErrorKind(StrEnum):
    AUTHENTICATION = "AUTHENTICATION"
    INVALID_REQUEST = "INVALID_REQUEST"
    RATE_LIMITED = "RATE_LIMITED"
    UPSTREAM = "UPSTREAM"
    TIMEOUT = "TIMEOUT"
    CONNECTION = "CONNECTION"
    CONTRACT = "CONTRACT"
    UNEXPECTED = "UNEXPECTED"


class AnalyzerClientError(RuntimeError):
    def __init__(
        self,
        kind: AnalyzerErrorKind,
        message: str,
        *,
        retryable: bool,
        status_code: int | None = None,
        analyzer_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.retryable = retryable
        self.status_code = status_code
        self.analyzer_code = analyzer_code


class AnalyzerClient:
    PATH = "/api/internal/v1/analyze-wallet"

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        headers = {
            "Authorization": f"Bearer {settings.analyzer_service_token.get_secret_value()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if settings.analyzer_sites_auth_token is not None:
            headers["OAI-Sites-Authorization"] = (
                f"Bearer {settings.analyzer_sites_auth_token.get_secret_value()}"
            )
        self._client = httpx.AsyncClient(
            base_url=str(settings.analyzer_base_url).rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(settings.analyzer_timeout),
            transport=transport,
            follow_redirects=False,
        )

    async def __aenter__(self) -> AnalyzerClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def analyze_wallet(self, wallet_address: str) -> WalletProfile:
        try:
            response = await self._client.post(
                self.PATH,
                json={"walletAddress": wallet_address, "contractVersion": "v1"},
            )
        except httpx.TimeoutException as exc:
            raise AnalyzerClientError(
                AnalyzerErrorKind.TIMEOUT,
                "The wallet analyzer timed out.",
                retryable=True,
            ) from exc
        except httpx.RequestError as exc:
            raise AnalyzerClientError(
                AnalyzerErrorKind.CONNECTION,
                "The wallet analyzer could not be reached.",
                retryable=True,
            ) from exc

        if response.status_code != 200:
            self._raise_http_error(response)

        try:
            payload = InternalAnalyzerResponse.model_validate(response.json())
        except (ValueError, ValidationError) as exc:
            raise AnalyzerClientError(
                AnalyzerErrorKind.CONTRACT,
                "The wallet analyzer returned an invalid v1 response.",
                retryable=False,
                status_code=response.status_code,
            ) from exc
        return payload.profile

    @staticmethod
    def _raise_http_error(response: httpx.Response) -> None:
        code: str | None = None
        message = "The wallet analyzer request failed."
        try:
            parsed = InternalAnalyzerErrorResponse.model_validate(response.json())
            code = parsed.error.code
            message = parsed.error.message
        except (ValueError, ValidationError):
            pass

        status = response.status_code
        if status in (401, 403):
            kind, retryable = AnalyzerErrorKind.AUTHENTICATION, False
        elif status in (400, 404, 415, 422):
            kind, retryable = AnalyzerErrorKind.INVALID_REQUEST, False
        elif status == 429:
            kind, retryable = AnalyzerErrorKind.RATE_LIMITED, True
        elif status >= 500:
            kind, retryable = AnalyzerErrorKind.UPSTREAM, True
        else:
            kind, retryable = AnalyzerErrorKind.UNEXPECTED, False
        raise AnalyzerClientError(
            kind,
            message,
            retryable=retryable,
            status_code=status,
            analyzer_code=code,
        )


def safe_analyzer_error(error: AnalyzerClientError) -> dict[str, Any]:
    return {
        "kind": error.kind.value,
        "message": str(error),
        "retryable": error.retryable,
        **({"code": error.analyzer_code} if error.analyzer_code else {}),
    }
