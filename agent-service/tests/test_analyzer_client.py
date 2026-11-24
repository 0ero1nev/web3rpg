import json

import httpx
import pytest

from app.clients.analyzer_client import (
    AnalyzerClient,
    AnalyzerClientError,
    AnalyzerErrorKind,
)
from conftest import make_settings, wallet_profile_payload


@pytest.mark.asyncio
async def test_client_calls_only_versioned_internal_endpoint_with_service_auth() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/internal/v1/analyze-wallet"
        assert request.headers["authorization"] == "Bearer test-service-token"
        assert json.loads(request.content) == {
            "walletAddress": "11111111111111111111111111111111",
            "contractVersion": "v1",
        }
        return httpx.Response(200, json={
            "contractVersion": "v1",
            "profile": wallet_profile_payload(),
        })

    client = AnalyzerClient(make_settings(), transport=httpx.MockTransport(handler))
    try:
        profile = await client.analyze_wallet("11111111111111111111111111111111")
    finally:
        await client.aclose()

    assert profile.persona_result is not None
    assert profile.persona_result.kind == "NORMAL_PERSONA"
    assert profile.data_quality.history_complete is True


@pytest.mark.asyncio
async def test_client_classifies_authentication_and_does_not_include_secret() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(401, json={
        "contractVersion": "v1",
        "error": {"code": "UNAUTHORIZED", "message": "Unauthorized."},
    }))
    client = AnalyzerClient(make_settings(), transport=transport)
    try:
        with pytest.raises(AnalyzerClientError) as captured:
            await client.analyze_wallet("11111111111111111111111111111111")
    finally:
        await client.aclose()

    assert captured.value.kind == AnalyzerErrorKind.AUTHENTICATION
    assert captured.value.retryable is False
    assert "test-service-token" not in str(captured.value)


@pytest.mark.asyncio
async def test_client_rejects_invalid_success_contract() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, json={"contractVersion": "v2", "profile": {}})
    )
    client = AnalyzerClient(make_settings(), transport=transport)
    try:
        with pytest.raises(AnalyzerClientError) as captured:
            await client.analyze_wallet("11111111111111111111111111111111")
    finally:
        await client.aclose()
    assert captured.value.kind == AnalyzerErrorKind.CONTRACT


@pytest.mark.asyncio
async def test_client_classifies_connection_failures() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    client = AnalyzerClient(make_settings(), transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(AnalyzerClientError) as captured:
            await client.analyze_wallet("11111111111111111111111111111111")
    finally:
        await client.aclose()
    assert captured.value.kind == AnalyzerErrorKind.CONNECTION
    assert captured.value.retryable is True
