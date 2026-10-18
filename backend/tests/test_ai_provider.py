"""Isolated provider and Food Vision response-contract tests."""
import asyncio
import sys
from types import ModuleType
from types import SimpleNamespace

import pytest

from app.ai import gemini_provider, vision
from app.ai.provider import AIProviderError
from app.routers.vision import FoodAnalysisSchema


class _Models:
    def __init__(self, results):
        self.results = iter(results)
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        value = next(self.results)
        if isinstance(value, Exception):
            raise value
        return value


def _fake_client(monkeypatch, results):
    models = _Models(results)
    fake_genai = ModuleType("google.genai")
    fake_genai.Client = lambda **kwargs: SimpleNamespace(aio=SimpleNamespace(models=models))
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        GenerateContentConfig=lambda **kwargs: kwargs,
        ThinkingConfig=lambda **kwargs: kwargs,
        Part=SimpleNamespace(from_text=lambda **kwargs: kwargs, from_bytes=lambda **kwargs: kwargs),
    )
    fake_genai.types = fake_types
    import google
    monkeypatch.setattr(google, "genai", fake_genai, raising=False)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)
    monkeypatch.setitem(sys.modules, "google.genai.types", fake_types)
    monkeypatch.setattr(gemini_provider, "get_gemini_api_key", lambda: "unit-test-key")
    monkeypatch.setattr(vision, "get_gemini_api_key", lambda: "unit-test-key")
    monkeypatch.setattr(gemini_provider.settings, "GEMINI_MODEL", "test-model")
    monkeypatch.setattr(vision.settings, "GEMINI_MODEL", "test-model")
    return models


@pytest.mark.asyncio
async def test_coach_provider_success(monkeypatch):
    models = _fake_client(monkeypatch, [SimpleNamespace(text='{"candidates":[{"output":"Evidence-based reply","finish_reason":"stop"}]}')])
    result = await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "How should I pace this?"}])
    assert result.content == "Evidence-based reply"
    call = models.calls[0]
    assert call["contents"][-1]["role"] == "user"
    assert call["config"]["max_output_tokens"] <= 256
    assert call["config"]["response_mime_type"] == "application/json"
    assert "temperature" not in call["config"]


@pytest.mark.asyncio
async def test_coach_provider_ends_with_user_and_caps_output_tokens(monkeypatch):
    models = _fake_client(monkeypatch, [SimpleNamespace(text='{"candidates":[{"output":"Keep your chest lifted.","finish_reason":"stop"}]}')])
    await gemini_provider.GeminiProvider().complete(
        [
            {"role": "user", "content": "How do I squat?"},
            {"role": "assistant", "content": "Keep your feet planted."},
        ],
        max_tokens=4096,
    )
    call = models.calls[0]
    assert call["contents"][-1]["role"] == "user"
    assert call["config"]["max_output_tokens"] == 256


@pytest.mark.asyncio
async def test_coach_provider_retries_timeout_then_succeeds(monkeypatch):
    _fake_client(monkeypatch, [TimeoutError(), SimpleNamespace(text='{"candidates":[{"output":"Recovered","finish_reason":"stop"}]}')])
    result = await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "Question"}])
    assert result.content == "Recovered"


@pytest.mark.asyncio
async def test_coach_provider_empty_response_returns_error_envelope_content(monkeypatch):
    _fake_client(monkeypatch, [SimpleNamespace(text="")])
    result = await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "Question"}])
    assert result.content == "Coach unavailable, using fallback."
    assert result.finish_reason == "error"


@pytest.mark.asyncio
async def test_coach_provider_nontransient_failure_returns_error_fallback(monkeypatch):
    class Rejected(Exception):
        code = 403

    _fake_client(monkeypatch, [Rejected("private provider detail")])
    result = await gemini_provider.GeminiProvider().complete([{"role": "user", "content": "Question"}])
    assert result.content == "Coach unavailable, using fallback."
    assert result.finish_reason == "error"


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
