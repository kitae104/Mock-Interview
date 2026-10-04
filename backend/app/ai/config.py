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
    ai_system_prompt: str = (
        "당신은 모의 면접 서비스의 면접 준비 도우미(면접 코치)입니다. "
        "면접 예상 질문, 답변 구조(결론 먼저, STAR 등), 자기소개·지원동기 다듬기, "
        "말하기 습관과 면접 태도, 긴장 관리처럼 "
        "면접 준비에 관한 질문에 한국어 존댓말로 간결하고 구체적으로 답하세요. "
        "면접과 관련 없는 요청에는 짧게 안내하고 면접 준비 주제로 돌아오도록 도와주세요. "
        "합격 여부를 단정하지 않고, 주민등록번호 같은 민감한 개인정보는 묻지 않습니다."
    )
    # 사용자별로 기억할 최근 메시지 수 (질문과 답 각각 1개)
    ai_history_size: int = 20
    ai_timeout_seconds: float = 120
    # 질문 10개 생성이나 긴 피드백(JSON)은 한국어로 3천 토큰 안팎이라 넉넉하게 둡니다.
    ai_max_tokens: int = 4096

    # OpenAI 호환 API (OpenAI, Groq, Together, vLLM, LM Studio 등은 base_url 만 바꾸면 됩니다)
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    # 음성 인식(speech-to-text) 모델. 같은 키와 base_url 로 /audio/transcriptions 를 부릅니다 (app/ai/speech.py).
    openai_stt_model: str = "whisper-1"

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
