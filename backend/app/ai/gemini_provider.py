"""Gemini API provider for the context-aware Fortis Coach."""
import asyncio
import logging
from typing import Dict, List, Optional

from app.ai.provider import AIProvider, AIProviderError, AIResponse
from app.config import settings, get_gemini_api_key

logger = logging.getLogger(__name__)

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

        # Ensure we have at least one user content item
        if not contents:
            contents.append({
                "role": "user",
                "parts": [{"text": "Hello coach"}]
            })

        api_key = get_gemini_api_key()
        if not api_key:
            raise AIProviderError("GEMINI_API_KEY is not configured in backend/.env")

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=45_000))
        model_name = settings.GEMINI_MODEL

        last_error = None
        for attempt in range(2):
            try:
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction="\n\n".join(system_parts) if system_parts else None,
                        temperature=0.6,
                        max_output_tokens=max_tokens,
                    ),
                )
                if response.text and response.text.strip():
                    return AIResponse(content=response.text.strip())
                raise AIProviderError("Gemini Coach returned an empty response. Please retry.")
            except AIProviderError:
                raise
            except Exception as exc:
                status = getattr(exc, "code", None)
                logger.warning("Gemini Coach attempt %d failed: type=%s status=%s", attempt + 1, type(exc).__name__, status)
                last_error = exc
                if (isinstance(exc, (TimeoutError, asyncio.TimeoutError)) or status in (408, 429, 500, 502, 503, 504)) and attempt == 0:
                    await asyncio.sleep(0.5)
                    continue
                break

        # If all candidates fail, raise clean user-facing error
        status = getattr(last_error, "code", None) if last_error else None
        if status == 400:
            detail = "Gemini rejected the Coach request. Check the configured model and request data."
        elif status in (401, 403):
            detail = "Gemini rejected the API key or the key does not have model access."
        elif status == 429:
            detail = "Gemini rate limit or quota reached. Please retry in a few moments."
        elif status == 503:
            detail = "Gemini service is temporarily experiencing high demand. Please try again in a few moments."
        else:
            detail = "Gemini Coach request failed. Check backend network access and the Gemini API configuration."
        raise AIProviderError(detail) from last_error
