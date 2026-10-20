"""
AI Provider Abstraction — The Fortis AI layer.

Architecture:
  AIProvider (abstract)
   ├── GeminiProvider    — Gemini API calls
   └── OpenAIProvider    — OpenAI API calls

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
    def __init__(self, content: str, tool_calls: Optional[List] = None, finish_reason: str = "stop"):
        self.content = content
        self.tool_calls = tool_calls or []
        self.finish_reason = finish_reason


class AIProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        max_tokens: int = 1024,
        user_id: Optional[int] = None,
    ) -> AIResponse:
        pass


def get_ai_provider() -> "AIProvider":
    """Return the configured live model provider; fail clearly for bad configuration."""
    provider = settings.AI_PROVIDER.strip().lower()
    if provider == "gemini":
        if not get_gemini_api_key():
            raise AIProviderError("GEMINI_API_KEY is not configured in backend/.env")
        from app.ai.gemini_provider import GeminiProvider
        return GeminiProvider()
    if provider == "openai":
        if not settings.AI_API_KEY.strip():
            raise AIProviderError("AI_API_KEY is not configured in backend/.env")
        from app.ai.openai_provider import OpenAIProvider
        return OpenAIProvider()
    raise AIProviderError("AI_PROVIDER must be set to 'gemini' or 'openai' in backend/.env")
