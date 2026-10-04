import httpx
import pytest

from app.ai.config import AiSettings
from app.ai.providers import ModelError
from app.ai.speech import DEFAULT_PROMPT, OpenAISpeechToText, WordTiming, get_speech_to_text

VERBOSE_JSON = {
    "text": " 안녕하세요. 저는 개발자입니다.",
    "language": "korean",
    "duration": 12.5,
    "words": [
        {"word": "안녕하세요", "start": 0.4, "end": 1.2},
        {"word": "저는", "start": 1.5, "end": 1.9},
        {"word": "개발자입니다", "start": 2.0, "end": 3.1},
        {"word": "  ", "start": 3.2, "end": 3.2},  # 빈 단어는 버린다
    ],
    "segments": [{"no_speech_prob": 0.03}, {"no_speech_prob": 0.4}],
}


def make_stt(api_key: str = "sk-test", **settings) -> OpenAISpeechToText:
    ai = AiSettings(**settings)
    return OpenAISpeechToText("http://stt.test/v1/", api_key, ai.openai_stt_model, ai)


def capture_post(monkeypatch, response: httpx.Response) -> dict:
    """httpx.post 를 가짜로 바꿔 요청을 기록합니다. 실제 httpx.Request 로 multipart 본문을 만들어 보므로,
    httpx 가 받아 주지 않는 형식(예: 파일과 함께 보내는 data 가 dict 가 아님)을 보내면 여기서 실패합니다."""
    seen: dict = {}

    def fake_post(url, **kwargs):
        request = httpx.Request("POST", url, headers=kwargs["headers"], data=kwargs["data"], files=kwargs["files"])
        seen.update(url=url, body=request.read(), content_type=request.headers["content-type"], **kwargs)
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    return seen


def field_values(seen: dict, name: str) -> list[str]:
    """실제로 인코딩된 multipart 본문에서 폼 필드(파일이 아닌 것)의 값을 모두 읽습니다."""
    boundary = seen["content_type"].split("boundary=")[1].encode()
    crlf = b"\r\n"
    values = []
    for part in seen["body"].split(b"--" + boundary):
        header, _, rest = part.partition(crlf + crlf)
        if f'name="{name}"'.encode() in header and b"filename=" not in header:
            values.append(rest.removesuffix(crlf).decode())
    return values


def test_request_shape(monkeypatch):
    seen = capture_post(monkeypatch, httpx.Response(200, json=VERBOSE_JSON))

    result = make_stt().transcribe(b"AUDIO", filename="answer.webm", content_type="audio/webm", prompt="분야: 백엔드")

    assert seen["url"] == "http://stt.test/v1/audio/transcriptions"
    assert seen["headers"] == {"Authorization": "Bearer sk-test"}
    # 실제로 인코딩된 multipart 본문 기준으로 확인한다
    assert seen["content_type"].startswith("multipart/form-data; boundary=")
    assert field_values(seen, "model") == ["whisper-1"]
    assert field_values(seen, "language") == ["ko"]
    assert field_values(seen, "response_format") == ["verbose_json"]
    # 단어별 시각과, 무음 판정용 no_speech_prob 를 받기 위한 구간 정보를 함께 요청한다
    assert field_values(seen, "timestamp_granularities[]") == ["word", "segment"]
    assert field_values(seen, "prompt") == ["분야: 백엔드"]
    assert b'name="file"; filename="answer.webm"' in seen["body"]
    assert b"Content-Type: audio/webm" in seen["body"]
    assert b"AUDIO" in seen["body"]
    assert seen["timeout"] == AiSettings().ai_timeout_seconds
    assert result.text == "안녕하세요. 저는 개발자입니다."


def test_model_name_comes_from_settings(monkeypatch):
    seen = capture_post(monkeypatch, httpx.Response(200, json=VERBOSE_JSON))
    make_stt(openai_stt_model="gpt-4o-mini-transcribe").transcribe(b"x", filename="a.webm", content_type="audio/webm")
    assert field_values(seen, "model") == ["gpt-4o-mini-transcribe"]


def test_prompt_is_optional(monkeypatch):
    seen = capture_post(monkeypatch, httpx.Response(200, json=VERBOSE_JSON))
    make_stt().transcribe(b"x", filename="a.webm", content_type="audio/webm")
    assert field_values(seen, "prompt") == []
    assert "음, 어" in DEFAULT_PROMPT  # 군말도 들리는 대로 받아 적도록 유도하는 문구


def test_response_is_parsed(monkeypatch):
    capture_post(monkeypatch, httpx.Response(200, json=VERBOSE_JSON))
    result = make_stt().transcribe(b"x", filename="a.webm", content_type="audio/webm")
    assert result.words == [
        WordTiming("안녕하세요", 0.4, 1.2),
        WordTiming("저는", 1.5, 1.9),
        WordTiming("개발자입니다", 2.0, 3.1),
    ]
    assert result.duration == 12.5
    assert result.language == "korean"
    assert result.no_speech_probs == [0.03, 0.4]


def test_empty_result_is_valid(monkeypatch):
    capture_post(monkeypatch, httpx.Response(200, json={"text": "", "duration": 3.0}))
    result = make_stt().transcribe(b"x", filename="a.webm", content_type="audio/webm")
    assert result.text == "" and result.words == [] and result.no_speech_probs == []
    assert result.duration == 3.0 and result.language is None


def test_missing_api_key_raises_model_error_without_calling(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("키가 없으면 요청을 보내지 않아야 합니다")

    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(ModelError, match="API 키"):
        make_stt(api_key="").transcribe(b"x", filename="a.webm", content_type="audio/webm")


def test_http_error_raises_model_error(monkeypatch):
    capture_post(monkeypatch, httpx.Response(401, text="bad key"))
    with pytest.raises(ModelError, match="401"):
        make_stt().transcribe(b"x", filename="a.webm", content_type="audio/webm")


def test_network_error_raises_model_error(monkeypatch):
    def fail(*args, **kwargs):
        raise httpx.ConnectError("연결 안 됨")

    monkeypatch.setattr(httpx, "post", fail)
    with pytest.raises(ModelError, match="연결 실패"):
        make_stt().transcribe(b"x", filename="a.webm", content_type="audio/webm")


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="JSON 이 아님"),
        httpx.Response(200, json=["배열"]),
        httpx.Response(200, json={"words": [{"word": "가"}]}),  # start/end 없음
        httpx.Response(200, json={"words": [{"word": "가", "start": "abc", "end": 1}]}),
    ],
)
def test_malformed_response_raises_model_error(monkeypatch, response):
    capture_post(monkeypatch, response)
    with pytest.raises(ModelError):
        make_stt().transcribe(b"x", filename="a.webm", content_type="audio/webm")


def test_get_speech_to_text_uses_openai_settings():
    stt = get_speech_to_text(AiSettings(openai_api_key="k", openai_base_url="http://x/v1", openai_stt_model="m"))
    assert isinstance(stt, OpenAISpeechToText)
    assert (stt.url, stt.api_key, stt.model) == ("http://x/v1/audio/transcriptions", "k", "m")
