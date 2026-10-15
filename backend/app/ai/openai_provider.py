"""OpenAI Provider — uses GPT-4o-mini for live AI Coach responses."""
from app.ai.provider import AIProvider, AIResponse, AIProviderError
from app.config import settings
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):

    def __init__(self):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=settings.AI_API_KEY)
        self.model = settings.AI_MODEL

    async def complete(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        max_tokens: int = 1024
    ) -> AIResponse:
        try:
            kwargs = {
                "model": self.model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.7,
            }
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"

            response = await self.client.chat.completions.create(**kwargs)
            msg = response.choices[0].message
            return AIResponse(
                content=msg.content or "",
                tool_calls=msg.tool_calls or []
            )
        except Exception as e:
            logger.exception("OpenAI API request failed")
            raise AIProviderError("OpenAI request failed. Check the configured API key, model access, and network.") from e
