"""Gemini API provider for the context-aware Fortis Coach."""
import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Dict, List, Optional

from app.ai.provider import AIProvider, AIProviderError, AIResponse
from app.config import settings, get_gemini_api_key

logger = logging.getLogger(__name__)

FALLBACK_RESPONSE = "Coach unavailable, using fallback."


class GeminiProvider(AIProvider):
    async def complete(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        max_tokens: int = 1024,
        user_id: Optional[int] = None,
    ) -> AIResponse:
        del tools  # The Coach currently uses grounded text responses, not function tools.
        system_parts = []
        contents = []
        for message in messages:
            role = message.get("role", "user")
            content = message.get("content", "")
            if role == "system":
                system_parts.append(content)
            else:
                contents.append({
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": content}],
                })

        # Gemini requires a user turn at the end of each GenerateContent request.
        if not contents or contents[-1]["role"] != "user":
            contents.append({
                "role": "user",
                "parts": [{"text": "Please respond to the user's latest question."}],
            })

        # Gemini expects turns to alternate; combine adjacent messages by role.
        normalized_contents = []
        for item in contents:
            if normalized_contents and normalized_contents[-1]["role"] == item["role"]:
                normalized_contents[-1]["parts"][0]["text"] += "\n\n" + item["parts"][0]["text"]
            else:
                normalized_contents.append(item)
        contents = normalized_contents

        api_key = get_gemini_api_key()
        if not api_key:
            raise AIProviderError("GEMINI_API_KEY is not configured in backend/.env")

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=20_000))

        # Keep one fast fallback for a missing or unavailable configured model.
        candidate_models = [settings.GEMINI_MODEL]
        fallback = "gemini-flash-lite-latest"
        if settings.GEMINI_MODEL != "test-model" and fallback not in candidate_models:
            candidate_models.append(fallback)

        last_error = None
        final_model = candidate_models[0]

        for model_name in candidate_models:
            final_model = model_name
            for attempt in range(2):
                attempt_started_at = datetime.utcnow()
                try:
                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction="\n\n".join(system_parts) if system_parts else None,
                            max_output_tokens=min(max_tokens, 192),
                            response_mime_type="application/json",
                            thinking_config=types.ThinkingConfig(thinking_level="low"),
                        ),
                    )
                    raw_text = (response.text or "").strip()
                    if raw_text:
                        # Strip any markdown code fences
                        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.IGNORECASE)
                        cleaned = re.sub(r"\s*```$", "", cleaned).strip()

                        # 1. Try standard JSON envelope parsing
                        parsed_content = None
                        try:
                            envelope = json.loads(cleaned)
                            if isinstance(envelope, dict):
                                candidates = envelope.get("candidates")
                                if isinstance(candidates, list) and len(candidates) > 0 and isinstance(candidates[0], dict):
                                    output = candidates[0].get("output")
                                    if isinstance(output, str) and output.strip():
                                        parsed_content = output.strip()
                                if not parsed_content:
                                    for key in ("output", "response", "message", "coach_response"):
                                        if key in envelope and isinstance(envelope[key], str) and envelope[key].strip():
                                            parsed_content = envelope[key].strip()
                                            break
                        except (json.JSONDecodeError, TypeError):
                            pass

                        # 2. If valid text is present outside of JSON envelope, use it directly
                        if not parsed_content and cleaned and not cleaned.startswith("{"):
                            parsed_content = cleaned

                        if parsed_content:
                            _fire_record(
                                user_id=user_id,
                                feature="ai_coach",
                                model=model_name,
                                started_at=attempt_started_at,
                                status="success",
                                usage_metadata=getattr(response, "usage_metadata", None),
                            )
                            return AIResponse(content=parsed_content, finish_reason="stop")

                    logger.warning("Gemini Coach model %s returned an unparseable response: %s", model_name, raw_text[:200])
                    # If empty or unparseable response returned, record attempt as failed and exit
                    _fire_record(
                        user_id=user_id,
                        feature="ai_coach",
                        model=model_name,
                        started_at=attempt_started_at,
                        status="failed",
                        usage_metadata=getattr(response, "usage_metadata", None),
                    )
                    return AIResponse(content=FALLBACK_RESPONSE, finish_reason="error")

                except AIProviderError:
                    raise
                except Exception as exc:
                    status = getattr(exc, "code", None)
                    logger.warning(
                        "Gemini Coach attempt %d with %s failed: type=%s status=%s detail=%s",
                        attempt + 1, model_name, type(exc).__name__, status, str(exc)[:500],
                    )
                    last_error = exc
                    # Count this outbound attempt exactly once
                    _fire_record(
                        user_id=user_id,
                        feature="ai_coach",
                        model=model_name,
                        started_at=attempt_started_at,
                        status="rate_limited" if status == 429 else "failed",
                        exc=exc,
                        http_status_code=status,
                    )
                    # Do not retry on client errors
                    if status in (400, 401, 403):
                        break
                    # A project quota is shared across model fallbacks; retries only waste
                    # requests and make the coach appear to answer with unrelated content.
                    if status == 429:
                        break
                    # If model is unavailable (503) or not found (404), move to next candidate model
                    if status in (503, 404):
                        break
                    if (isinstance(exc, (TimeoutError, asyncio.TimeoutError)) or status in (408, 500, 502, 504)) and attempt == 0:
                        await asyncio.sleep(0.5)
                        continue
                    break
            if getattr(last_error, "code", None) in (400, 401, 403):
                break
            if getattr(last_error, "code", None) == 429:
                break

        # Log unavailability
        status_code = getattr(last_error, "code", None) if last_error else None
        logger.error("Gemini Coach unavailable after model fallbacks and retries (status=%s)", status_code)
        return AIResponse(content=FALLBACK_RESPONSE, finish_reason="error")


def _fire_record(
    *,
    user_id: Optional[int],
    feature: str,
    model: str,
    started_at: datetime,
    status: str,
    usage_metadata=None,
    exc: Optional[Exception] = None,
    http_status_code: Optional[int] = None,
) -> None:
    """Schedule a fire-and-forget usage record. Never raises."""
    try:
        from app.services.usage_tracker import usage_tracker
        completed_at = datetime.utcnow()
        asyncio.create_task(
            usage_tracker.record_attempt(
                user_id=user_id,
                feature=feature,
                model=model,
                started_at=started_at,
                completed_at=completed_at,
                status=status,
                usage_metadata=usage_metadata,
                exc=exc,
                http_status_code=http_status_code,
            )
        )
    except Exception:
        pass  # Analytics must never break AI responses


def _fire_record(
    *,
    user_id: Optional[int],
    feature: str,
    model: str,
    started_at: datetime,
    status: str,
    usage_metadata=None,
    exc: Optional[Exception] = None,
    http_status_code: Optional[int] = None,
) -> None:
    """Schedule a fire-and-forget usage record. Never raises."""
    try:
        from app.services.usage_tracker import usage_tracker
        completed_at = datetime.utcnow()
        asyncio.create_task(
            usage_tracker.record_attempt(
                user_id=user_id,
                feature=feature,
                model=model,
                started_at=started_at,
                completed_at=completed_at,
                status=status,
                usage_metadata=usage_metadata,
                exc=exc,
                http_status_code=http_status_code,
            )
        )
    except Exception:
        pass  # Analytics must never break AI responses
