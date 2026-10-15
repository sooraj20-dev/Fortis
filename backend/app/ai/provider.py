"""
AI Provider Abstraction — The Fortis AI layer.

Architecture:
  AIProvider (abstract)
   ├── MockAIProvider    — Always works, no API key needed
  ├── GeminiProvider    — Gemini API calls
   └── (LocalModel)      — Extensible

The AI Coach uses this provider to generate natural-language explanations
of Fortis decisions. The LLM is the communication layer, NOT the brain.
The brain is FortisDecisionEngine.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from app.config import settings, get_gemini_api_key
import logging

logger = logging.getLogger(__name__)


class AIProviderError(RuntimeError):
    """Raised when the configured AI service cannot produce a response."""


class AIResponse:
    def __init__(self, content: str, tool_calls: Optional[List] = None):
        self.content = content
        self.tool_calls = tool_calls or []


class AIProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        max_tokens: int = 1024
    ) -> AIResponse:
        pass


def get_ai_provider() -> "AIProvider":
    """Return only the explicitly configured provider; never hide a provider failure with mock data."""
    provider_name = settings.AI_PROVIDER.lower()
    if provider_name == "openai":
        if not settings.AI_API_KEY.strip():
            raise AIProviderError("AI_API_KEY is not configured on the backend.")
        from app.ai.openai_provider import OpenAIProvider
        return OpenAIProvider()
    if provider_name == "gemini":
        if not get_gemini_api_key():
            raise AIProviderError("GEMINI_API_KEY is not configured on the backend.")
        from app.ai.gemini_provider import GeminiProvider
        return GeminiProvider()

    if provider_name in {"mock", "local"}:
        from app.ai.mock_provider import MockAIProvider
        logger.warning("AI_PROVIDER=%s; using the local mock provider", provider_name)
        return MockAIProvider()

    raise AIProviderError(f"Unsupported AI_PROVIDER '{settings.AI_PROVIDER}'. Configure gemini or openai.")
