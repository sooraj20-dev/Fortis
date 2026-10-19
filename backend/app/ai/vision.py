"""Multimodal Gemini helpers shared by Fortis Vision endpoints."""
import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import io
import json
import logging
import random
import re
from typing import Any, Dict, List, Optional, Tuple, Type
from pydantic import BaseModel

from app.ai.provider import AIProviderError
from app.config import settings, get_gemini_api_key

logger = logging.getLogger(__name__)


def _error_payload(exc: Exception) -> Any:
    """Read structured provider error details without exposing them to logs."""
    payload = getattr(exc, "response_json", None) or getattr(exc, "body", None)
    response = getattr(exc, "response", None)
    if payload is None and response is not None:
        try:
            payload = response.json()
        except Exception:
            payload = getattr(response, "text", None)
    if isinstance(payload, str):
        try:
            return json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            return payload
    return payload


def _flatten_error(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(f"{key} {_flatten_error(item)}" for key, item in value.items()).casefold()
    if isinstance(value, (list, tuple)):
        return " ".join(_flatten_error(item) for item in value).casefold()
    return str(value or "").casefold()


def _retry_after_seconds(exc: Exception, payload: Any) -> Optional[float]:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    retry_after = headers.get("Retry-After") if headers is not None else None
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except (TypeError, ValueError):
            try:
                retry_at = parsedate_to_datetime(str(retry_after))
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
            except (TypeError, ValueError, OverflowError):
                pass

    def find_retry_delay(value: Any) -> Optional[float]:
        if isinstance(value, dict):
            for key, item in value.items():
                if key.casefold() in {"retrydelay", "retry_delay"}:
                    match = re.search(r"\d+(?:\.\d+)?", str(item))
                    if match:
                        return float(match.group())
                found = find_retry_delay(item)
                if found is not None:
                    return found
        elif isinstance(value, list):
            for item in value:
                found = find_retry_delay(item)
                if found is not None:
                    return found
        return None

    return find_retry_delay(payload)


def _rate_limit_kind(exc: Exception, payload: Any) -> str:
    """Return daily, transient, or unknown based on Google's quota details."""
    details = _flatten_error(payload)
    message = _flatten_error(getattr(exc, "message", "")) + " " + str(exc).casefold()
    combined = details + " " + message
    if any(term in combined for term in ("perday", "per_day", "daily quota", "quota_exceeded", "prepay", "credit balance")):
        return "daily"
    if any(term in combined for term in (
        "rate_limit_exceeded", "too_many_requests", "perminute", "per_minute", "persecond", "per_second",
        "requests per minute", "tokens per minute", "requests per second", "tokens per second",
    )):
        return "transient"
    return "unknown"

def resize_image_bytes(image_bytes: bytes, max_dim: int = 1024, quality: int = 85) -> Tuple[bytes, str]:
    """Resize image to within max_dim while preserving aspect ratio, returning JPEG bytes."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        if max(width, height) > max_dim:
            scale = max_dim / float(max(width, height))
            new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue(), "image/jpeg"
    except Exception as e:
        logger.debug("Image resize bypassed: %s", e)
        return image_bytes, "image/jpeg"


async def analyze_images_json(
    prompt: str,
    images: List[Tuple[bytes, str]],
    *,
    response_schema: Optional[Type[BaseModel]] = None,
    max_tokens: int = 1500,
    max_output_token_cap: int = 900,
    thinking_level: Optional[str] = None,
) -> Dict[str, Any]:
    """Use the configured Gemini Flash model to analyze images and return validated JSON."""
    api_key = get_gemini_api_key()
    if not api_key:
        raise AIProviderError("GEMINI_API_KEY is not configured in backend/.env")

    from google import genai
    from google.genai import types

    http_options = {"timeout": 45_000}
    retry_options_type = getattr(types, "HttpRetryOptions", None)
    if retry_options_type is not None:
        # Keep retries here so 429 daily quotas are not blindly retried by the SDK.
        http_options["retry_options"] = retry_options_type(
            attempts=1,
            http_status_codes=[408, 500, 502, 503, 504],
        )
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(**http_options))

    # Process and resize images where appropriate
    processed_images = []
    for img_bytes, mime_type in images:
        resized_bytes, out_mime = resize_image_bytes(img_bytes, max_dim=1024, quality=85)
        processed_images.append((resized_bytes, out_mime))

    parts = [types.Part.from_text(text=prompt)]
    parts.extend(
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        for image_bytes, mime_type in processed_images
    )

    model_name = settings.GEMINI_MODEL
    last_error = None
    response = None

    for attempt in range(2):
        try:
            config_kwargs: Dict[str, Any] = {
                "response_mime_type": "application/json",
                "max_output_tokens": min(max_tokens, max_output_token_cap),
            }
            if thinking_level is not None:
                config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=thinking_level)
            elif not model_name.startswith(("gemini-3.6", "gemini-3.7", "gemini-3.8", "gemini-4")):
                config_kwargs["temperature"] = 0.1
            if response_schema:
                config_kwargs["response_schema"] = response_schema

            response = await client.aio.models.generate_content(
                model=model_name,
                contents=parts,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            break
        except Exception as exc:
            status = getattr(exc, "code", None)
            logger.warning("Gemini vision attempt %d failed: type=%s status=%s", attempt + 1, type(exc).__name__, status)
            last_error = exc
            if attempt == 0 and status == 429:
                error_payload = _error_payload(exc)
                kind = _rate_limit_kind(exc, error_payload)
                retry_delay = _retry_after_seconds(exc, error_payload)
                if kind == "transient" and (retry_delay is None or retry_delay <= 60):
                    base_delay = retry_delay if retry_delay is not None else min(0.5 * (2 ** attempt), 8.0)
                    await asyncio.sleep(base_delay + random.uniform(0.0, 0.25))
                    continue
            break

    if response is None:
        status = getattr(last_error, "code", None) if last_error else None
        if status == 400:
            detail = "Gemini rejected the image or request. Try a smaller JPEG/PNG image or a clearer photo."
        elif status in (401, 403):
            detail = "Gemini rejected the API key or the key does not have access to this vision model."
        elif status == 429:
            error_payload = _error_payload(last_error) if last_error else None
            kind = _rate_limit_kind(last_error, error_payload) if last_error else "unknown"
            if kind == "daily":
                detail = "Gemini daily quota is exhausted. Check the project's Gemini quota or retry after it resets."
            elif kind == "transient":
                detail = "Gemini rate limit reached. Wait before retrying or reduce request frequency."
            else:
                detail = "Gemini returned HTTP 429, but its response did not identify a retryable rate limit. Check the project's Gemini quota details."
        elif status == 503:
            detail = "Gemini vision service is experiencing high demand. Please retry in a few moments."
        else:
            detail = "Gemini vision request failed. Check backend network and Gemini API configuration."
        raise AIProviderError(detail) from last_error

    text = response.text or ""
    candidates = getattr(response, "candidates", None) or []
    finish_reason = str(getattr(candidates[0], "finish_reason", "unknown")) if candidates else "no_candidate"
    prompt_feedback = getattr(response, "prompt_feedback", None)
    block_reason = str(getattr(prompt_feedback, "block_reason", "none"))

    if "MAX_TOKENS" in finish_reason.upper():
        raise AIProviderError("Gemini stopped at the output token limit; the food analysis was not complete. Please retry.")

    if not text.strip():
        logger.warning(
            "Gemini vision returned empty text: finish_reason=%s block_reason=%s",
            finish_reason,
            block_reason,
        )
        if "SAFETY" in finish_reason.upper() or "SAFETY" in block_reason.upper():
            raise AIProviderError("Image blocked by Gemini safety policy. Please try a different food image.")
        raise AIProviderError("Gemini returned no readable analysis. Please try again.")

    # Parse JSON
    candidate_text = text.strip()
    if candidate_text.startswith("```"):
        candidate_text = candidate_text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(candidate_text)
    except json.JSONDecodeError as exc:
        logger.warning("Gemini vision returned invalid JSON: finish_reason=%s block_reason=%s len=%d", finish_reason, block_reason, len(text))
        if "MAX_TOKENS" in finish_reason.upper():
            detail = "Analysis was cut off before completing. Please retry with a smaller or clearer photo."
        elif "SAFETY" in finish_reason.upper() or "SAFETY" in block_reason.upper():
            detail = "Image was blocked by Gemini safety filters. Please try another photo."
        else:
            detail = "Gemini returned an incomplete or invalid analysis. Please retry with a clearer photo."
        raise AIProviderError(detail) from exc

    if not isinstance(result, dict):
        raise AIProviderError("Gemini returned an unexpected response structure. Please retry.")
    if response_schema is not None:
        try:
            result = response_schema.model_validate(result).model_dump()
        except Exception as exc:
            logger.warning("Gemini vision response failed schema validation: schema=%s", response_schema.__name__)
            raise AIProviderError("Gemini returned analysis that did not match the required food schema. Please retry.") from exc
    return result
