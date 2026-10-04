"""음성 인식(speech-to-text). providers.py 의 ChatModel 과 같은 방식으로 프로토콜만 노출합니다.

라우터와 서비스는 SpeechToText 프로토콜(SpeechToTextDep)만 알고,
어떤 서비스인지는 get_speech_to_text 가 설정으로 정합니다.
SDK 없이 httpx 로 OpenAI 호환 API(POST {base_url}/audio/transcriptions)를 부릅니다.
오디오는 이 모듈을 거쳐 서비스에 전달되기만 하고 어디에도 저장하지 않습니다.
"""

from dataclasses import dataclass, field
from typing import Annotated, Protocol

import httpx
from fastapi import Depends

from app.ai.config import AiSettings, AiSettingsDep
from app.ai.providers import ModelError

# 한국어 면접 답변을 군말까지 그대로 받아 적도록 유도하는 문구 (docs/PLAN.md 4.2).
# 음성 인식은 군말을 지우는 경향이 있습니다.
DEFAULT_PROMPT = "면접 답변입니다. 음, 어, 그, 저 같은 말도 들리는 대로 적어 주세요."


@dataclass(frozen=True)
class WordTiming:
    """단어 하나와 그 단어가 들린 구간(녹음 시작부터 초)"""

    word: str
    start: float
    end: float


@dataclass(frozen=True)
class Transcription:
    text: str
    words: list[WordTiming] = field(default_factory=list)
    #: 서비스가 알려 준 오디오 길이(초). 없으면 None
    duration: float | None = None
    language: str | None = None
    #: 구간(segment)마다의 "말이 없을 확률". 모두 높으면 무음에서 지어낸 문장일 가능성이 큽니다.
    no_speech_probs: list[float] = field(default_factory=list)


class SpeechToText(Protocol):
    def transcribe(
        self, audio: bytes, *, filename: str, content_type: str, prompt: str | None = None
    ) -> Transcription: ...


class OpenAISpeechToText:
    """POST {base_url}/audio/transcriptions (OpenAI whisper-1 과 호환 서버). 단어별 시각을 받습니다."""

    def __init__(self, base_url: str, api_key: str, model: str, settings: AiSettings) -> None:
        self.url = base_url.rstrip("/") + "/audio/transcriptions"
        self.api_key = api_key
        self.model = model
        self.settings = settings

    def transcribe(self, audio: bytes, *, filename: str, content_type: str, prompt: str | None = None) -> Transcription:
        if not self.api_key:
            raise ModelError("API 키가 설정되지 않았습니다.")
        # 파일과 함께 보내는 폼 필드는 dict 여야 합니다 (httpx 의 multipart 인코딩).
        # 같은 이름을 여러 번 보낼 때는 값을 목록으로 줍니다.
        form: dict[str, str | list[str]] = {
            "model": self.model,
            "language": "ko",
            "response_format": "verbose_json",
            # 단어별 시각(침묵·말하기 속도 계산)과 구간 정보(무음 판정용 no_speech_prob)를 함께 받습니다.
            "timestamp_granularities[]": ["word", "segment"],
        }
        if prompt:
            form["prompt"] = prompt
        try:
            res = httpx.post(
                self.url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                data=form,
                files={"file": (filename, audio, content_type)},
                timeout=self.settings.ai_timeout_seconds,
            )
        except httpx.HTTPError as e:
            raise ModelError(f"연결 실패: {e}") from e
        if res.status_code >= 400:
            raise ModelError(f"HTTP {res.status_code}: {res.text[:300]}")
        try:
            return _parse(res.json())
        except ValueError as e:  # JSON 이 아닌 응답
            raise ModelError("음성 인식 응답을 읽을 수 없습니다.") from e


def _parse(data: object) -> Transcription:
    try:
        assert isinstance(data, dict)
        words = [
            WordTiming(word=str(w["word"]).strip(), start=float(w["start"]), end=float(w["end"]))
            for w in data.get("words") or []
        ]
        no_speech = [
            float(s["no_speech_prob"]) for s in data.get("segments") or [] if s.get("no_speech_prob") is not None
        ]
        duration = float(data["duration"]) if data.get("duration") is not None else None
        return Transcription(
            text=str(data.get("text") or "").strip(),
            words=[w for w in words if w.word],
            duration=duration,
            language=str(data["language"]) if data.get("language") else None,
            no_speech_probs=no_speech,
        )
    except (AssertionError, KeyError, TypeError, ValueError, AttributeError) as e:
        raise ModelError(f"예상하지 못한 응답 형식: {data!r:.200}") from e


def get_speech_to_text(settings: AiSettingsDep) -> SpeechToText:
    return OpenAISpeechToText(settings.openai_base_url, settings.openai_api_key, settings.openai_stt_model, settings)


SpeechToTextDep = Annotated[SpeechToText, Depends(get_speech_to_text)]
