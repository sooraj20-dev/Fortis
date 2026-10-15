"""Isolated provider and Food Vision response-contract tests."""
import asyncio
from types import SimpleNamespace

import pytest

from app.ai import gemini_provider, vision
from app.ai.provider import AIProviderError
from app.routers.vision import FoodAnalysisSchema


class _Models:
    def __init__(self, results):
        self.results = iter(results)

    async def generate_content(self, **kwargs):
        value = next(self.results)
        if isinstance(value, Exception):
            raise value
        return value


def _fake_client(monkeypatch, results):
    models = _Models(results)
    fake_genai = SimpleNamespace(Client=lambda **kwargs: SimpleNamespace(aio=SimpleNamespace(models=models)))
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        GenerateContentConfig=lambda **kwargs: kwargs,
        Part=SimpleNamespace(from_text=lambda **kwargs: kwargs, from_bytes=lambda **kwargs: kwargs),
    )
    import google
    monkeypatch.setattr(google, "genai", fake_genai, raising=False)
    monkeypatch.setitem(__import__("sys").modules, "google.genai.types", fake_types)
    monkeypatch.setattr(gemini_provider, "get_gemini_api_key", lambda: "unit-test-key")
    monkeypatch.setattr(vision, "get_gemini_api_key", lambda: "unit-test-key")
    monkeypatch.setattr(gemini_provider.settings, "GEMINI_MODEL", "test-model")
    monkeypatch.setattr(vision.settings, "GEMINI_MODEL", "test-model")
    return models


@pytest.mark.asyncio
async def test_coach_provider_success(monkeypatch):
    _fake_client(monkeypatch, [SimpleNamespace(text="Evidence-based reply")])
    result = await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "How should I pace this?"}])
    assert result.content == "Evidence-based reply"


@pytest.mark.asyncio
async def test_coach_provider_retries_timeout_then_succeeds(monkeypatch):
    _fake_client(monkeypatch, [TimeoutError(), SimpleNamespace(text="Recovered")])
    result = await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "Question"}])
    assert result.content == "Recovered"


@pytest.mark.asyncio
async def test_coach_provider_empty_response_fails(monkeypatch):
    _fake_client(monkeypatch, [SimpleNamespace(text="")])
    with pytest.raises(AIProviderError, match="empty response"):
        await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "Question"}])


@pytest.mark.asyncio
async def test_coach_provider_nontransient_failure_is_reported(monkeypatch):
    class Rejected(Exception):
        code = 403

    _fake_client(monkeypatch, [Rejected("private provider detail")])
    with pytest.raises(AIProviderError, match="rejected the API key"):
        await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "Question"}])


@pytest.mark.asyncio
async def test_food_vision_validates_schema_and_rejects_truncated_json(monkeypatch):
    good = {
        "food_name": "Rice and lentils", "region": "South India", "confidence": 0.9,
        "serving_description": "one plate", "serving_g": 300, "calories": 420,
        "protein_g": 16, "carbs_g": 72, "fat_g": 8, "fiber_g": 9,
        "sugar_g": 3, "alternatives": [], "is_healthy": None, "brief_note": "Estimate",
    }
    _fake_client(monkeypatch, [SimpleNamespace(text=__import__("json").dumps(good), candidates=[] )])
    parsed = await vision.analyze_images_json("Analyze generic food", [(b"image", "image/jpeg")], response_schema=FoodAnalysisSchema)
    assert FoodAnalysisSchema.model_validate(parsed).food_name == "Rice and lentils"

    _fake_client(monkeypatch, [SimpleNamespace(text='{"food_name":"Rice",', candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")])])
    with pytest.raises(AIProviderError, match="cut off"):
        await vision.analyze_images_json("Analyze generic food", [(b"image", "image/jpeg")], response_schema=FoodAnalysisSchema)
