"""모델 제공자 연결. SDK 없이 httpx 로 각 제공자의 HTTP API 를 부릅니다.

라우터와 서비스는 ChatModel 프로토콜만 알고, 어떤 제공자인지는 get_chat_model 이 설정으로 정합니다.
새 제공자를 붙이려면 ChatModel 을 구현한 클래스를 만들고 get_chat_model 에 연결하세요.
"""

from typing import Annotated, Protocol

import httpx
from fastapi import Depends

from app.ai.config import AiSettings, AiSettingsDep

Message = dict[str, str]  # {"role": "user" | "assistant", "content": "..."}


class ModelError(Exception):
    """모델 호출 실패 (키 없음, 네트워크, 제공자 오류). 라우터가 502 로 바꿉니다."""


def response_shape(data: object) -> str:
    """예상하지 못한 응답을 설명하는 문구. 응답 내용(사용자 답변이 섞일 수 있음)은 넣지 않고 모양만 알립니다."""
    if isinstance(data, dict):
        return "키: " + ", ".join(sorted(str(k) for k in data)[:10])
    return f"형식: {type(data).__name__}"


class ChatModel(Protocol):
    def complete(self, system: str, messages: list[Message]) -> str: ...


class OpenAICompatibleModel:
    """POST {base_url}/chat/completions (OpenAI, Ollama /v1, 그 밖의 OpenAI 호환 서버)."""

    def __init__(self, base_url: str, api_key: str, model: str, settings: AiSettings) -> None:
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.api_key = api_key
        self.model = model
        self.settings = settings

    def complete(self, system: str, messages: list[Message]) -> str:
        if not self.api_key:
            raise ModelError("API 키가 설정되지 않았습니다.")
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "max_tokens": self.settings.ai_max_tokens,
        }
        data = _post(self.url, {"Authorization": f"Bearer {self.api_key}"}, body, self.settings)
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise ModelError(f"예상하지 못한 응답 형식 ({response_shape(data)})") from e


class AnthropicModel:
    """POST {base_url}/v1/messages (Anthropic Messages API)."""

    def __init__(self, settings: AiSettings) -> None:
        self.url = settings.anthropic_base_url.rstrip("/") + "/v1/messages"
        self.settings = settings

    def complete(self, system: str, messages: list[Message]) -> str:
        if not self.settings.anthropic_api_key:
            raise ModelError("API 키가 설정되지 않았습니다.")
        headers = {"x-api-key": self.settings.anthropic_api_key, "anthropic-version": "2023-06-01"}
        body = {
            "model": self.settings.anthropic_model,
            "system": system,
            "messages": messages,
            "max_tokens": self.settings.ai_max_tokens,
        }
        data = _post(self.url, headers, body, self.settings)
        try:
            return "".join(block.get("text", "") for block in data["content"] if block.get("type") == "text")
        except (KeyError, TypeError) as e:
            raise ModelError(f"예상하지 못한 응답 형식 ({response_shape(data)})") from e


def _post(url: str, headers: dict[str, str], body: dict, settings: AiSettings) -> dict:
    try:
        res = httpx.post(url, headers=headers, json=body, timeout=settings.ai_timeout_seconds)
    except httpx.HTTPError as e:
        raise ModelError(f"연결 실패: {e}") from e
    if res.status_code >= 400:
        raise ModelError(f"HTTP {res.status_code}: {res.text[:300]}")
    return res.json()


def get_chat_model(settings: AiSettingsDep) -> ChatModel:
    if settings.ai_provider == "anthropic":
        return AnthropicModel(settings)
    if settings.ai_provider == "ollama":
        # Ollama 는 키를 쓰지 않지만 OpenAI 호환 API 형식상 아무 값이나 넣습니다.
        return OpenAICompatibleModel(settings.ollama_base_url + "/v1", "ollama", settings.ollama_model, settings)
    return OpenAICompatibleModel(settings.openai_base_url, settings.openai_api_key, settings.openai_model, settings)


ChatModelDep = Annotated[ChatModel, Depends(get_chat_model)]
