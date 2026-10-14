"""
AI Provider Abstraction — The Fortis AI layer.

Architecture:
  AIProvider (abstract)
   ├── MockAIProvider    — Always works, no API key needed
   ├── OpenAIProvider    — Real GPT-4o-mini calls
   └── (LocalModel)      — Extensible

The AI Coach uses this provider to generate natural-language explanations
of Fortis decisions. The LLM is the communication layer, NOT the brain.
The brain is FortisDecisionEngine.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from app.config import settings
import logging

logger = logging.getLogger(__name__)


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
    """Factory function — returns configured provider."""
    provider_name = settings.AI_PROVIDER.lower()
    if provider_name == "openai" and settings.AI_API_KEY:
        from app.ai.openai_provider import OpenAIProvider
        return OpenAIProvider()
    else:
        from app.ai.mock_provider import MockAIProvider
        if provider_name == "openai" and not settings.AI_API_KEY:
            logger.warning("OpenAI provider selected but no API key configured. Using MockAIProvider.")
        return MockAIProvider()
