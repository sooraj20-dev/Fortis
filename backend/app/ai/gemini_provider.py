"""Gemini API provider for the context-aware Fortis Coach."""
import asyncio
import json
import logging
import re
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

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=45_000))
        
        # Build list of candidate models with fallbacks for high demand / outages
        candidate_models = [settings.GEMINI_MODEL]
        if settings.GEMINI_MODEL != "test-model":
            for fallback in ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-flash-latest"]:
                if fallback not in candidate_models:
                    candidate_models.append(fallback)

        last_error = None
        for model_name in candidate_models:
            for attempt in range(2):
                try:
                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction="\n\n".join(system_parts) if system_parts else None,
                            max_output_tokens=min(max_tokens, 256),
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
                        try:
                            envelope = json.loads(cleaned)
                            if isinstance(envelope, dict):
                                candidates = envelope.get("candidates")
                                if isinstance(candidates, list) and len(candidates) > 0 and isinstance(candidates[0], dict):
                                    output = candidates[0].get("output")
                                    if isinstance(output, str) and output.strip():
                                        return AIResponse(content=output.strip(), finish_reason="stop")
                                for key in ("output", "response", "message", "coach_response"):
                                    if key in envelope and isinstance(envelope[key], str) and envelope[key].strip():
                                        return AIResponse(content=envelope[key].strip(), finish_reason="stop")
                        except (json.JSONDecodeError, TypeError):
                            pass

                        # 2. If valid text is present outside of JSON envelope, use it directly
                        if cleaned and not cleaned.startswith("{"):
                            return AIResponse(content=cleaned, finish_reason="stop")

                    logger.warning("Gemini Coach model %s returned an unparseable response: %s", model_name, raw_text[:200])
                except AIProviderError:
                    raise
                except Exception as exc:
                    status = getattr(exc, "code", None)
                    logger.warning(
                        "Gemini Coach attempt %d with %s failed: type=%s status=%s detail=%s",
                        attempt + 1, model_name, type(exc).__name__, status, str(exc)[:500],
                    )
                    if last_error is None or status is not None:
                        last_error = exc
                    # Do not retry on client errors
                    if status in (400, 401, 403):
                        break
                    # If model is unavailable (503) or not found (404), move to next candidate model
                    if status in (503, 404):
                        break
                    if (isinstance(exc, (TimeoutError, asyncio.TimeoutError)) or status in (408, 429, 500, 502, 504)) and attempt == 0:
                        await asyncio.sleep(0.5)
                        continue
                    break
            if getattr(last_error, "code", None) in (400, 401, 403):
                break

        # Return the required fallback after all candidate models and retries are exhausted.
        status = getattr(last_error, "code", None) if last_error else None
        if status == 400:
            detail = "Gemini rejected the Coach request. Check the configured model and request data."
        elif status in (401, 403):
            detail = "Gemini rejected the API key or the key does not have model access."
        elif status == 429:
            detail = "Gemini rate limit or quota reached. Please retry in a few moments."
        elif status == 503:
            detail = "Gemini service is temporarily experiencing high demand across models. Please try again in a few moments."
        else:
            detail = "Gemini Coach request failed. Check backend network access and the Gemini API configuration."
        logger.error("Gemini Coach unavailable after model fallbacks and retries: %s", detail)
        return AIResponse(content=FALLBACK_RESPONSE, finish_reason="error")

