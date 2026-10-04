"""답변 오디오 파일 검사. 브라우저 MediaRecorder 가 만드는 형식(webm, ogg, mp4/m4a)과 wav 를 받습니다.

클라이언트가 말한 콘텐츠 타입과 파일 이름은 믿지 않고, **파일 머리 바이트**로 실제 형식을 판별합니다 (docs/PLAN.md 7.6).
"""

# 지원하는 형식 → 음성 인식 서비스에 알려 줄 콘텐츠 타입
AUDIO_FORMATS: dict[str, str] = {
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "mp4": "audio/mp4",  # mp4, m4a 모두 이 컨테이너
    "wav": "audio/wav",
}

SUPPORTED_FORMATS_TEXT = "webm, ogg, mp4, m4a, wav"


def detect_audio_format(data: bytes) -> str | None:
    """머리 바이트로 형식을 찾습니다. 지원하지 않는 형식이면 None."""
    if data[:4] == b"\x1a\x45\xdf\xa3":  # EBML: webm (matroska)
        return "webm"
    if data[:4] == b"OggS":
        return "ogg"
    if data[4:8] == b"ftyp":  # mp4 / m4a
        return "mp4"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    return None


def upload_filename(audio_format: str) -> str:
    """음성 인식 서비스에 보낼 파일 이름. 클라이언트가 준 이름은 쓰지 않고 형식에 맞는 고정 이름을 씁니다."""
    return f"answer.{audio_format}"
