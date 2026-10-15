"""Multimodal Gemini helpers shared by Fortis Vision endpoints."""
import asyncio
import io
import json
import logging
from typing import Any, Dict, List, Optional, Tuple, Type
from pydantic import BaseModel

from app.ai.provider import AIProviderError
from app.config import settings, get_gemini_api_key

logger = logging.getLogger(__name__)

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
) -> Dict[str, Any]:
    """Use the configured Gemini Flash model to analyze images and return validated JSON."""
    api_key = get_gemini_api_key()
    if not api_key:
        raise AIProviderError("GEMINI_API_KEY is not configured in backend/.env")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=45_000))

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
                "temperature": 0.1,
                "max_output_tokens": min(max_tokens, 900),
            }
            if response_schema:
                config_kwargs["response_schema"] = response_schema

            response = await client.aio.models.generate_content(
                model=model_name,
                contents=parts,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            if response and response.text and response.text.strip():
                break
        except Exception as exc:
            status = getattr(exc, "code", None)
            logger.warning("Gemini vision attempt %d failed: type=%s status=%s", attempt + 1, type(exc).__name__, status)
            last_error = exc
            if (isinstance(exc, (TimeoutError, asyncio.TimeoutError)) or status in (408, 429, 500, 502, 503, 504)) and attempt == 0:
                await asyncio.sleep(0.5)
                continue
            break

    if not response or not (response.text and response.text.strip()):
        status = getattr(last_error, "code", None) if last_error else None
        if status == 400:
            detail = "Gemini rejected the image or request. Try a smaller JPEG/PNG image or a clearer photo."
        elif status in (401, 403):
            detail = "Gemini rejected the API key or the key does not have access to this vision model."
        elif status == 429:
            detail = "Gemini rate limit or quota reached. Please retry in a few moments."
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

    if not text.strip():
        logger.warning(
            "Gemini vision returned empty text: finish_reason=%s block_reason=%s",
            finish_reason,
            block_reason,
        )
        if "SAFETY" in finish_reason.upper() or "SAFETY" in block_reason.upper():
            raise AIProviderError("Image blocked by Gemini safety policy. Please try a different food image.")
        if "MAX_TOKENS" in finish_reason.upper():
            raise AIProviderError("Analysis was truncated. Try taking a photo closer to the dish.")
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
