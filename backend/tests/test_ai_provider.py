"""Isolated provider and Food Vision response-contract tests."""
import asyncio
import sys
from io import BytesIO
from types import ModuleType
from types import SimpleNamespace

import pytest

from app.ai import gemini_provider, vision
from app.ai.provider import AIProviderError
from app.routers.vision import FoodAnalysisSchema, _analyze_food_with_gemini, analyze_food_image
from starlette.datastructures import UploadFile


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
    models.client_calls = []

    def fake_client_factory(**kwargs):
        models.client_calls.append(kwargs)
        return SimpleNamespace(aio=SimpleNamespace(models=models))

    fake_genai.Client = fake_client_factory
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        HttpRetryOptions=lambda **kwargs: kwargs,
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
    assert call["config"]["max_output_tokens"] == 192  # GeminiProvider caps Coach output at 192 tokens


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


def _food_result():
    return {
        "food_name": "Rice and lentils", "region": "South India", "confidence": 0.9,
        "serving_description": "one plate", "serving_g": 300, "calories": 420,
        "protein_g": 16, "carbs_g": 72, "fat_g": 8, "fiber_g": 9,
        "sugar_g": 3, "alternatives": [], "is_healthy": None, "brief_note": "Estimate",
    }


@pytest.mark.asyncio
async def test_food_vision_validates_json_schema_and_sends_image(monkeypatch):
    import json
    good = _food_result()
    models = _fake_client(monkeypatch, [SimpleNamespace(text=json.dumps(good), candidates=[SimpleNamespace(finish_reason="STOP")])])
    parsed = await _analyze_food_with_gemini(b"image bytes", "image/jpeg")
    assert FoodAnalysisSchema.model_validate(parsed).food_name == "Rice and lentils"
    call = models.calls[0]
    assert call["contents"][1]["data"] == b"image bytes"
    assert call["contents"][1]["mime_type"] == "image/jpeg"
    assert call["config"]["response_mime_type"] == "application/json"
    assert call["config"]["max_output_tokens"] == 1500
    assert call["config"]["thinking_config"]["thinking_level"] == "low"
    assert "temperature" not in call["config"]
    assert models.client_calls[0]["api_key"] == "unit-test-key"
    assert models.calls[0]["model"] == "test-model"
    assert models.client_calls[0]["http_options"]["retry_options"]["http_status_codes"] == [408, 500, 502, 503, 504]


@pytest.mark.asyncio
async def test_food_vision_rejects_max_tokens_even_if_json_parses(monkeypatch):
    import json
    _fake_client(monkeypatch, [SimpleNamespace(
        text=json.dumps(_food_result()), candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")]
    )])
    with pytest.raises(AIProviderError, match="output token limit"):
        await vision.analyze_images_json("Analyze food", [(b"image", "image/jpeg")], response_schema=FoodAnalysisSchema)


@pytest.mark.asyncio
async def test_food_vision_rejects_truncated_json(monkeypatch):
    _fake_client(monkeypatch, [SimpleNamespace(
        text='{"food_name":"Rice",', candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")]
    )])
    with pytest.raises(AIProviderError, match="output token limit"):
        await vision.analyze_images_json("Analyze food", [(b"image", "image/jpeg")], response_schema=FoodAnalysisSchema)


@pytest.mark.asyncio
async def test_food_vision_handles_empty_max_tokens_response_without_duplicate_call(monkeypatch):
    models = _fake_client(monkeypatch, [SimpleNamespace(
        text="", candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")]
    )])
    with pytest.raises(AIProviderError, match="output token limit"):
        await vision.analyze_images_json("Analyze food", [(b"image", "image/jpeg")])
    assert len(models.calls) == 1


@pytest.mark.asyncio
async def test_food_vision_retries_transient_429_using_provider_delay(monkeypatch):
    class RateLimited(Exception):
        code = 429
        response_json = {"error": {
            "status": "RESOURCE_EXHAUSTED",
            "message": "Quota exceeded for requests per minute",
            "details": [
                {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [
                    {"quotaId": "GenerateRequestsPerMinutePerProjectPerModel"}
                ]},
                {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "2s"},
            ],
        }}

    models = _fake_client(monkeypatch, [RateLimited(), SimpleNamespace(text='{}', candidates=[])])
    sleeps = []

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr(vision.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(vision.random, "uniform", lambda _low, _high: 0.1)
    await vision.analyze_images_json("Analyze food", [(b"image", "image/jpeg")])
    assert len(models.calls) == 2
    assert sleeps == [2.1]


@pytest.mark.asyncio
async def test_food_vision_does_not_retry_daily_quota_429(monkeypatch):
    class DailyQuota(Exception):
        code = 429
        response_json = {"error": {
            "status": "RESOURCE_EXHAUSTED",
            "message": "Daily quota exceeded",
            "details": [
                {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [
                    {"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}
                ]},
                {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "47s"},
            ],
        }}

    models = _fake_client(monkeypatch, [DailyQuota()])
    sleeps = []

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr(vision.asyncio, "sleep", fake_sleep)
    with pytest.raises(AIProviderError, match="daily quota"):
        await vision.analyze_images_json("Analyze food", [(b"image", "image/jpeg")])
    assert len(models.calls) == 1
    assert sleeps == []


@pytest.mark.asyncio
async def test_food_vision_does_not_retry_ambiguous_server_failure(monkeypatch):
    class ServerFailure(Exception):
        code = 503

    models = _fake_client(monkeypatch, [ServerFailure()])
    with pytest.raises(AIProviderError, match="high demand"):
        await vision.analyze_images_json("Analyze food", [(b"image", "image/jpeg")])
    assert len(models.calls) == 1


@pytest.mark.asyncio
async def test_food_route_uses_gemini_and_preserves_response_contract(monkeypatch):
    from types import SimpleNamespace

    captured = {}

    async def fake_gemini(content, mime_type):
        captured["image"] = content
        captured["mime_type"] = mime_type
        return _food_result()

    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            return None

    class Db:
        def query(self, _model):
            return Query()

    monkeypatch.setattr("app.routers.vision._analyze_food_with_gemini", fake_gemini)
    response = await analyze_food_image(
        UploadFile(filename="meal.jpg", file=BytesIO(b"jpeg bytes"), headers={"content-type": "image/jpeg"}),
        SimpleNamespace(id=7), Db(),
    )
    assert captured == {"image": b"jpeg bytes", "mime_type": "image/jpeg"}
    assert set(response) == {"top_prediction", "alternatives", "nutrition_estimate", "disclaimer", "confirm_prompt"}
    assert response["top_prediction"]["name"] == "Rice and lentils"
    assert response["nutrition_estimate"]["source"] == "Gemini Flash estimate"


def test_health_check_remains_available_with_gemini_configuration(monkeypatch):
    from app import database
    from app.main import health_check

    class MongoDb:
        def command(self, name):
            assert name == "ping"

    monkeypatch.setattr(database, "get_mongo_db", lambda: MongoDb())
    monkeypatch.setattr("app.main.settings.AI_PROVIDER", "gemini")
    result = health_check()
    assert result["status"] == "ok"
    assert result["ai_provider"] == "gemini"
