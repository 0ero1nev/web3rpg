from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.chat import router as chat_router
from app.api.routes.health import router as health_router
from app.clients.analyzer_client import AnalyzerClient
from app.clients.openai_client import OpenAIWalletReasoningModel
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.graph.workflow import build_workflow


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    analyzer = AnalyzerClient(settings)
    model = OpenAIWalletReasoningModel(settings)
    app.state.settings = settings
    app.state.analyzer = analyzer
    app.state.workflow = build_workflow(
        model=model,
        analyzer=analyzer,
        settings=settings,
    )
    try:
        yield
    finally:
        await analyzer.aclose()


def create_app() -> FastAPI:
    application = FastAPI(
        title="Onchain Persona Agent",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.include_router(health_router)
    application.include_router(chat_router)
    return application


app = create_app()
