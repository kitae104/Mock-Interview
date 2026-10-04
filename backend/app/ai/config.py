from functools import lru_cache
from typing import Annotated, Literal

from fastapi import Depends
from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["openai", "anthropic", "ollama"]


class AiSettings(BaseSettings):
    """AI 설정. 환경 변수 이름은 필드 이름의 대문자입니다 (ai_provider → AI_PROVIDER, openai_api_key → OPENAI_API_KEY).

    로컬 개발(make backend-dev)에서는 프로젝트 루트의 .env 도 읽어 API 키를 한곳에서 관리합니다.
    """

    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    ai_provider: Provider = "openai"
    ai_system_prompt: str = "당신은 이 서비스의 친절한 도우미입니다. 한국어로 간결하게 답하세요."
    # 사용자별로 기억할 최근 메시지 수 (질문과 답 각각 1개)
    ai_history_size: int = 20
    ai_timeout_seconds: float = 120
    ai_max_tokens: int = 1024

    # OpenAI 호환 API (OpenAI, Groq, Together, vLLM, LM Studio 등은 base_url 만 바꾸면 됩니다)
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_base_url: str = "https://api.anthropic.com"

    # Ollama 는 OpenAI 호환 엔드포인트(/v1)로 부릅니다.
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"


@lru_cache
def get_ai_settings() -> AiSettings:
    return AiSettings()


AiSettingsDep = Annotated[AiSettings, Depends(get_ai_settings)]
