from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class OpenAIProxyRequest(BaseModel):
    api_key: str
    messages: List[ChatMessage]
    model: str = "gpt-4o-mini"
    max_tokens: int = 500