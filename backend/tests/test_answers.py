import json
from collections.abc import Iterator

import pytest
from sqlalchemy import select

from app.ai.providers import ModelError
from app.ai.speech import Transcription, WordTiming, get_speech_to_text
from app.core.config import Settings, get_settings
from app.interviews.models import (
    Interview,
    InterviewAnswer,
    InterviewLevel,
    InterviewQuestion,
    InterviewStatus,
    QuestionCategory,
)
from app.interviews.ratelimit import ai_limiter
from app.main import app
from tests.conftest import TEST_PASSWORD, TEST_SECRET, unique_email

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 200
OGG = b"OggS" + b"\x00" * 200
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 200
M4A = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 200
WAV = b"RIFF\x24\x08\x00\x00WAVEfmt " + b"\x00" * 200


class FakeSTT:
    """실제 음성 인식 대신 정해진 결과를 돌려주고, 받은 요청을 기록합니다."""

    def __init__(self, result: Transcription | None = None, fail: bool = False) -> None:
        self.result = result or good_transcription()
        self.fail = fail
        self.calls: list[dict] = []

    def transcribe(self, audio: bytes, *, filename: str, content_type: str, prompt: str | None = None) -> Transcription:
        self.calls.append({"audio": audio, "filename": filename, "content_type": content_type, "prompt": prompt})
        if self.fail:
            raise ModelError("테스트 실패")
        return self.result


def good_transcription() -> Transcription:
    """40초 동안 말한 답변: 첫 발화 1.5초, 3초 침묵 한 번, 군말 '음' 두 번."""
    words = [WordTiming("음", 1.5, 1.8), WordTiming("저는", 2.0, 2.4)]
    words += [WordTiming("백엔드", 2.5 + i * 1.0, 3.2 + i * 1.0) for i in range(8)]  # 2.5 ~ 10.2
    words += [WordTiming("음", 13.2, 13.5)]  # 10.2 → 13.2: 3초 침묵
    words += [WordTiming("개발자입니다", 14.0 + i * 1.5, 15.0 + i * 1.5) for i in range(16)]  # 14 ~ 38
    text = "음 저는 " + " ".join(["백엔드"] * 8) + " 음 " + " ".join(["개발자입니다"] * 16)
    return Transcription(text=text, words=words, duration=40.0, language="korean", no_speech_probs=[0.02, 0.1])


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> Iterator[None]:
    ai_limiter.reset()
    yield
    ai_limiter.reset()


@pytest.fixture
def stt(client) -> FakeSTT:
    fake = FakeSTT()
    app.dependency_overrides[get_speech_to_text] = lambda: fake
    return fake


def use_settings(**overrides) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        database_url="sqlite://", jwt_secret=TEST_SECRET, **overrides
    )


def signup(client) -> tuple[dict[str, str], int]:
    email = unique_email()
    client.post("/api/auth/signup", json={"email": email, "password": TEST_PASSWORD, "name": "테스터"})
    token = client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD}).json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    return headers, client.get("/api/users/me", headers=headers).json()["id"]


def add_interview(db_session_factory, user_id: int, status=InterviewStatus.IN_PROGRESS) -> dict:
    """AI 로 질문을 만들지 않고 DB 에 면접과 질문 3개를 바로 넣습니다. 질문 유형: 자기소개, 직무 지식, 마무리.
    기본은 시작된(IN_PROGRESS) 면접입니다."""
    with db_session_factory() as db:
        interview = Interview(
            user_id=user_id,
            title="백엔드 개발자 신입 모의 면접",
            field="백엔드 개발자",
            level=InterviewLevel.NEWCOMER,
            question_count=3,
            status=status,
            max_answer_seconds=120,
            prep_seconds=10,
            questions=[
                InterviewQuestion(
                    seq=1, category=QuestionCategory.SELF_INTRO, text="자기소개를 해 주세요.", intent="의도1"
                ),
                InterviewQuestion(seq=2, category=QuestionCategory.JOB_KNOWLEDGE, text="REST 란?", intent="의도2"),
                InterviewQuestion(seq=3, category=QuestionCategory.CLOSING, text="마지막으로 한마디?", intent="의도3"),
            ],
        )
        db.add(interview)
        db.commit()
        return {"id": interview.id, "questions": [q.id for q in interview.questions]}


@pytest.fixture
def owner(client, db_session_factory):
    headers, user_id = signup(client)
    return headers, add_interview(db_session_factory, user_id)


def upload(
    client,
    headers,
    interview_id,
    question_id,
    audio=WEBM,
    duration_ms=40_000,
    nonverbal=None,
    content_type="audio/webm",
):
    data: dict[str, str] = {"durationMs": str(duration_ms)}
    if nonverbal is not None:
        data["nonverbal"] = nonverbal if isinstance(nonverbal, str) else json.dumps(nonverbal)
    files = {"audio": ("answer.webm", audio, content_type)} if audio is not None else None
    return client.post(
        f"/api/interviews/{interview_id}/questions/{question_id}/answer", data=data, files=files, headers=headers
    )


def send(client, owner, index: int = 0, **kwargs):
    """owner 픽스처((헤더, 면접))의 index 번째 질문에 답변을 보냅니다."""
    headers, interview = owner
    return upload(client, headers, interview["id"], interview["questions"][index], **kwargs)


NONVERBAL = {
    "version": 1,
    "analysisSeconds": 39.8,
    "sampleCoverage": 0.97,
    "faceFrames": 390,
    "poseFrames": 390,
    "faceVisibleRatio": 0.98,
    "gazeAtCameraRatio": 0.74,
    "headMotionDegPerSec": 8.2,
    "shoulderTiltDeg": 2.1,
    "postureCollapseRatio": 0.05,
    "smileRatio": 0.2,
    "blinksPerMinute": 17.5,
    "gesturesPerMinute": None,
    "handMotionIndex": None,
    "handsVisibleRatio": 0.02,
    "clientThresholds": {"gazeYawMaxDeg": 15, "smileOn": 0.35},
}


# ---- 정상 동작 ----


def test_submit_answer_returns_transcript_and_speech_metrics(client, owner, stt):
    headers, interview = owner
    res = send(client, owner, 0)

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["questionId"] == interview["questions"][0]
    assert body["transcript"].startswith("음 저는 백엔드")
    assert body["audioSeconds"] == 40.0
    assert body["timedOut"] is False
    assert body["feedback"] is None and body["score"] is None and body["nonverbal"] is None
    assert body["feedbackStatus"] == "FAILED"  # 테스트의 기본 AI 모델은 항상 실패 — 그래도 답변은 저장된다

    m = body["speech"]["metrics"]
    assert m["noSpeech"] is False
    assert m["answerSeconds"] == 40.0 and m["maxAnswerSeconds"] == 120
    assert m["wordCount"] == 27
    assert m["firstSpeechSeconds"] == 1.5
    assert m["speechSpanSeconds"] == pytest.approx(36.0)  # 1.5 ~ 37.5
    assert m["silenceCount"] == 1 and m["silenceTotalSeconds"] == 3.0 and m["longestSilenceSeconds"] == 3.0
    assert m["fillerCount"] == 2 and m["fillerBreakdown"] == {"음": 2}
    assert m["fillerPerMinute"] == pytest.approx(2 / (36.0 / 60), abs=0.1)
    assert m["syllablesPerMinute"] == pytest.approx(m["syllableCount"] / (36.0 / 60), abs=0.1)

    v = body["speech"]["verdicts"]
    assert set(v) == {"pace", "duration", "firstSpeech", "silence", "filler"}
    assert v["firstSpeech"] == {"level": "GOOD", "label": "바로 시작", "reference": "3초 이하"}
    assert v["silence"] == {"level": "FAIR", "label": "가끔", "reference": "0회 이하"}
    assert v["duration"] == {
        "level": "GOOD",
        "label": "적정",
        "reference": "40~90초",
    }  # 자기소개의 적정 시간은 40~90초, 40.0초는 하한
    assert body["id"] > 0


def test_stt_receives_the_audio_with_a_fixed_name_and_prompt(client, owner, stt):
    headers, interview = owner
    send(client, owner, 1, audio=WEBM)
    (call,) = stt.calls
    assert call["audio"] == WEBM
    assert call["filename"] == "answer.webm"  # 클라이언트가 준 이름은 쓰지 않는다
    assert call["content_type"] == "audio/webm"
    assert "분야: 백엔드 개발자" in call["prompt"]


@pytest.mark.parametrize(
    ("audio", "filename", "content_type"),
    [
        (WEBM, "answer.webm", "audio/webm"),
        (OGG, "answer.ogg", "audio/ogg"),
        (MP4, "answer.mp4", "audio/mp4"),
        (M4A, "answer.mp4", "audio/mp4"),
        (WAV, "answer.wav", "audio/wav"),
    ],
)
def test_supported_formats_are_detected_by_their_header(client, owner, stt, audio, filename, content_type):
    headers, interview = owner
    # 클라이언트가 보낸 콘텐츠 타입은 믿지 않는다 (아래는 일부러 엉뚱한 값)
    res = send(client, owner, 0, audio=audio, content_type="application/octet-stream")
    assert res.status_code == 201, res.text
    assert stt.calls[0]["filename"] == filename and stt.calls[0]["content_type"] == content_type


def test_audio_is_not_stored_anywhere(client, owner, stt, db_session_factory):
    headers, interview = owner
    send(client, owner, 0)
    with db_session_factory() as db:
        answer = db.scalar(select(InterviewAnswer))
        assert WEBM not in {v for v in answer.__dict__.values() if isinstance(v, bytes)}
        columns = {c.name for c in InterviewAnswer.__table__.columns}
    assert not any("audio_data" in c or "blob" in c or "file" in c for c in columns)
    # 응답에도 오디오는 없다
    body = client.get(f"/api/interviews/{interview['id']}", headers=headers).json()
    assert "audio" not in json.dumps(body["questions"][0]["answer"]).replace("audioSeconds", "")


def test_answer_is_included_in_the_interview_detail(client, owner, stt):
    headers, interview = owner
    send(client, owner, 0)
    detail = client.get(f"/api/interviews/{interview['id']}", headers=headers).json()
    assert detail["answeredCount"] == 1
    assert detail["questions"][0]["answer"]["speech"]["metrics"]["wordCount"] == 27
    assert detail["questions"][1]["answer"] is None


def test_interview_must_be_started_first(client, owner, stt, db_session_factory):
    headers, interview = owner
    with db_session_factory() as db:
        db.get(Interview, interview["id"]).status = InterviewStatus.READY
        db.commit()
    res = send(client, owner)
    assert res.status_code == 409
    assert res.json()["message"] == "면접이 아직 시작되지 않았습니다. 장치 점검 화면에서 시작해 주세요."
    assert stt.calls == []  # 동의를 기록하고 시작하기 전에는 음성을 외부로 보내지 않는다


# ---- 덮어쓰기 ----


def test_sending_again_overwrites_the_answer(client, owner, stt, db_session_factory):
    headers, interview = owner
    first = send(client, owner, 0)
    assert first.status_code == 201

    # 첫 답변에 피드백이 붙어 있었다면, 새 답변이 오면 지워진다
    with db_session_factory() as db:
        answer = db.scalar(select(InterviewAnswer))
        answer.feedback = {"summary": "이전 피드백"}
        answer.score = 77
        db.commit()

    stt.result = Transcription(
        text="다시 말씀드리겠습니다. 저는 백엔드 개발자입니다.",
        words=[WordTiming("다시", 0.5, 0.9), WordTiming("말씀드리겠습니다", 1.0, 2.0), WordTiming("저는", 2.1, 2.4),
               WordTiming("백엔드", 2.5, 3.0), WordTiming("개발자입니다", 3.1, 4.0)],
        duration=5.0,
    )  # fmt: skip
    second = send(client, owner, 0, duration_ms=5_000)

    assert second.status_code == 200, second.text  # 덮어쓰기는 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["transcript"].startswith("다시 말씀드리겠습니다")
    assert second.json()["feedback"] is None and second.json()["score"] is None
    with db_session_factory() as db:
        assert len(db.scalars(select(InterviewAnswer)).all()) == 1
    assert client.get(f"/api/interviews/{interview['id']}", headers=headers).json()["answeredCount"] == 1


# ---- 빈 답변 ----


def test_empty_recognition_is_saved_as_an_empty_answer(client, owner, stt):
    headers, interview = owner
    stt.result = Transcription(text="", words=[], duration=12.0)
    res = send(client, owner, 0, duration_ms=12_000)

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["transcript"] == ""
    assert body["audioSeconds"] == 12.0
    assert body["speech"]["metrics"]["noSpeech"] is True
    assert body["speech"]["metrics"]["wordCount"] == 0
    assert body["speech"]["metrics"]["syllablesPerMinute"] is None
    assert {v["level"] for v in body["speech"]["verdicts"].values()} == {"NA"}
    assert client.get(f"/api/interviews/{interview['id']}", headers=headers).json()["answeredCount"] == 1


def test_invented_text_on_silence_is_discarded(client, owner, stt, db_session_factory):
    headers, interview = owner
    stt.result = Transcription(
        text="시청해 주셔서 감사합니다",
        words=[WordTiming("시청해", 0.0, 1.0), WordTiming("주셔서", 1.0, 2.0), WordTiming("감사합니다", 2.0, 3.0)],
        duration=20.0,
        no_speech_probs=[0.97],
    )
    body = send(client, owner, 0, duration_ms=20_000).json()
    assert body["transcript"] == "" and body["speech"]["metrics"]["noSpeech"] is True
    with db_session_factory() as db:
        answer = db.scalar(select(InterviewAnswer))
        assert answer.transcript == "" and answer.words == []


def test_audio_duration_falls_back_to_the_client_value(client, owner, stt):
    headers, interview = owner
    stt.result = Transcription(text="", words=[], duration=None)
    body = send(client, owner, 0, duration_ms=7_500).json()
    assert body["audioSeconds"] == 7.5


def test_timed_out_when_the_recording_reached_the_limit(client, owner, stt):
    headers, interview = owner
    assert send(client, owner, 0, duration_ms=119_800).json()["timedOut"] is True
    assert send(client, owner, 1, duration_ms=60_000).json()["timedOut"] is False


# ---- 개인정보 가림 ----


def test_personal_data_is_masked_in_stored_text_but_not_in_metrics(client, owner, stt, db_session_factory):
    headers, interview = owner
    stt.result = Transcription(
        text="제 연락처는 010-1234-5678 이고 메일은 me@example.com 입니다 감사합니다 잘 부탁드립니다",
        words=[
            WordTiming("제", 0.0, 0.2), WordTiming("연락처는", 0.3, 1.0), WordTiming("010-1234-5678", 1.1, 3.0),
            WordTiming("이고", 3.1, 3.5), WordTiming("메일은", 3.6, 4.0), WordTiming("me@example.com", 4.1, 6.0),
            WordTiming("입니다", 6.1, 6.5), WordTiming("감사합니다", 6.6, 7.5), WordTiming("잘", 7.6, 7.8),
            WordTiming("부탁드립니다", 7.9, 9.0),
        ],
        duration=10.0,
    )  # fmt: skip
    body = send(client, owner, 0, duration_ms=10_000).json()

    assert "010-1234-5678" not in body["transcript"] and "[전화번호]" in body["transcript"]
    assert "me@example.com" not in body["transcript"] and "[이메일]" in body["transcript"]
    with db_session_factory() as db:
        stored = db.scalar(select(InterviewAnswer))
        assert "010-1234-5678" not in json.dumps(stored.words, ensure_ascii=False)
        assert "me@example.com" not in json.dumps(stored.words, ensure_ascii=False)
        assert "[전화번호]" in json.dumps(stored.words, ensure_ascii=False)
    # 지표는 인식된 원문으로 계산했으므로 단어 수가 그대로다
    assert body["speech"]["metrics"]["wordCount"] == 10


# ---- 비언어 지표 ----


def test_nonverbal_metrics_are_validated_and_returned(client, owner, stt, db_session_factory):
    headers, interview = owner
    res = send(client, owner, 0, nonverbal=NONVERBAL)
    assert res.status_code == 201, res.text
    nonverbal = res.json()["nonverbal"]
    assert nonverbal["reliable"] is True
    assert nonverbal["metrics"]["gazeAtCameraRatio"] == 0.74
    assert nonverbal["metrics"]["gesturesPerMinute"] is None
    assert nonverbal["metrics"]["clientThresholds"] == {"gazeYawMaxDeg": 15, "smileOn": 0.35}
    with db_session_factory() as db:
        assert db.scalar(select(InterviewAnswer)).nonverbal_metrics["faceVisibleRatio"] == 0.98


def test_nonverbal_with_little_face_is_not_reliable(client, owner, stt):
    headers, interview = owner
    nonverbal = {**NONVERBAL, "faceVisibleRatio": 0.3}
    assert send(client, owner, 0, nonverbal=nonverbal).json()["nonverbal"]["reliable"] is False
    nonverbal = {**NONVERBAL, "sampleCoverage": 0.4}
    assert send(client, owner, 1, nonverbal=nonverbal).json()["nonverbal"]["reliable"] is False


def test_nonverbal_is_optional(client, owner, stt):
    headers, interview = owner
    assert send(client, owner, 0, nonverbal="  ").json()["nonverbal"] is None


@pytest.mark.parametrize(
    ("nonverbal", "key"),
    [
        ("이건 JSON 이 아님", "nonverbal"),
        ({**NONVERBAL, "faceVisibleRatio": 1.5}, "nonverbal.faceVisibleRatio"),
        ({**NONVERBAL, "blinksPerMinute": -1}, "nonverbal.blinksPerMinute"),
        ({k: v for k, v in NONVERBAL.items() if k != "version"}, "nonverbal.version"),
        ({**NONVERBAL, "faceFrames": "많음"}, "nonverbal.faceFrames"),
        ({**NONVERBAL, "clientThresholds": {f"k{i}": 1 for i in range(41)}}, "nonverbal.clientThresholds"),
        ("[1, 2]", "nonverbal"),
    ],
)
def test_invalid_nonverbal_is_400_and_nothing_is_saved(client, owner, stt, nonverbal, key):
    headers, interview = owner
    res = send(client, owner, 0, nonverbal=nonverbal)
    assert res.status_code == 400, res.text
    assert key in res.json()["errors"]
    assert stt.calls == []  # 음성 인식 비용이 들기 전에 거절한다


def test_oversized_nonverbal_json_is_400(client, owner, stt):
    headers, interview = owner
    huge = json.dumps({**NONVERBAL, "clientThresholds": {"x": 1}}) + " " * 25_000
    res = send(client, owner, 0, nonverbal=huge)
    assert res.status_code == 400 and "너무 큽니다" in res.json()["errors"]["nonverbal"]


# ---- 입력 검증 ----


def test_wrong_format_is_400(client, owner, stt):
    headers, interview = owner
    res = send(client, owner, 0, audio=b"this is not audio data " * 20)
    assert res.status_code == 400
    assert "지원하지 않는 오디오 형식" in res.json()["message"] and "webm, ogg, mp4, m4a, wav" in res.json()["message"]
    assert stt.calls == []


def test_content_type_alone_does_not_make_it_audio(client, owner, stt):
    headers, interview = owner
    res = send(client, owner, 0, audio=b"<html>" + b"a" * 100, content_type="audio/webm")
    assert res.status_code == 400


def test_empty_file_is_400(client, owner, stt):
    headers, interview = owner
    res = send(client, owner, 0, audio=b"")
    assert res.status_code == 400 and "비어 있습니다" in res.json()["message"]


def test_missing_audio_is_400(client, owner, stt):
    headers, interview = owner
    res = send(client, owner, 0, audio=None)
    assert res.status_code == 400
    assert "audio" in res.json()["errors"]


@pytest.mark.parametrize("duration", ["-1", "abc", "3600001"])
def test_invalid_duration_is_400(client, owner, stt, duration):
    headers, interview = owner
    res = client.post(
        f"/api/interviews/{interview['id']}/questions/{interview['questions'][0]}/answer",
        data={"durationMs": duration},
        files={"audio": ("a.webm", WEBM, "audio/webm")},
        headers=headers,
    )
    assert res.status_code == 400 and "durationMs" in res.json()["errors"]


def test_missing_duration_is_400(client, owner, stt):
    headers, interview = owner
    res = client.post(
        f"/api/interviews/{interview['id']}/questions/{interview['questions'][0]}/answer",
        files={"audio": ("a.webm", WEBM, "audio/webm")},
        headers=headers,
    )
    assert res.status_code == 400 and "durationMs" in res.json()["errors"]


def test_too_large_file_is_413(client, owner, stt):
    headers, interview = owner
    use_settings(interview_max_audio_mb=1)
    just_over = WEBM + b"\x00" * (1024 * 1024)
    res = send(client, owner, 0, audio=just_over)
    assert res.status_code == 413
    assert "1MB 이하" in res.json()["message"]
    assert stt.calls == []
    # 상한 이하이면 통과한다
    ok = WEBM + b"\x00" * (1024 * 1024 - len(WEBM))
    assert send(client, owner, 0, audio=ok).status_code == 201


# ---- 권한·상태 ----


def test_requires_login(client, owner, stt):
    _, interview = owner
    res = upload(client, {}, interview["id"], interview["questions"][0])
    assert res.status_code == 401
    assert stt.calls == []


def test_other_users_interview_is_404(client, owner, stt):
    _, interview = owner
    other_headers, _ = signup(client)
    res = upload(client, other_headers, interview["id"], interview["questions"][0])
    assert res.status_code == 404 and res.json()["message"] == "면접을 찾을 수 없습니다."
    assert stt.calls == []


def test_question_must_belong_to_the_interview(client, owner, stt, db_session_factory):
    headers, interview = owner
    _, user_id = signup(client)
    other_interview = add_interview(db_session_factory, user_id)
    # 내 면접 id 에 다른 사람 면접의 질문 id 를 섞어 보낸다
    res = upload(client, headers, interview["id"], other_interview["questions"][0])
    assert res.status_code == 404 and res.json()["message"] == "질문을 찾을 수 없습니다."
    assert upload(client, headers, interview["id"], 999_999).status_code == 404
    assert stt.calls == []


def test_completed_interview_is_409(client, owner, stt, db_session_factory):
    headers, interview = owner
    with db_session_factory() as db:
        db.get(Interview, interview["id"]).status = InterviewStatus.COMPLETED
        db.commit()
    res = send(client, owner, 0)
    assert res.status_code == 409 and res.json()["message"] == "이미 종료된 면접입니다."
    assert stt.calls == []


# ---- 실패 처리 ----


def test_speech_recognition_failure_is_502_and_nothing_is_saved(client, owner, stt):
    headers, interview = owner
    stt.fail = True
    res = send(client, owner, 0)
    assert res.status_code == 502
    assert res.json()["message"] == "음성을 텍스트로 바꾸지 못했습니다. 다시 시도해 주세요."
    assert client.get(f"/api/interviews/{interview['id']}", headers=headers).json()["answeredCount"] == 0
    # 다시 보내면 성공한다 (실패한 시도는 흔적이 없다)
    stt.fail = False
    assert send(client, owner, 0).status_code == 201


def test_rate_limit_applies_to_answer_uploads(client, owner, stt):
    headers, interview = owner
    use_settings(interview_ai_rate_per_minute=4)  # 답변 하나에 음성 인식과 피드백, 두 번 셉니다
    assert send(client, owner, 0).status_code == 201
    assert send(client, owner, 1).status_code == 201
    res = send(client, owner, 2)
    assert res.status_code == 429
    assert len(stt.calls) == 2


def test_invalid_requests_do_not_use_up_the_rate_limit(client, owner, stt):
    headers, interview = owner
    use_settings(interview_ai_rate_per_minute=1)
    for _ in range(3):
        assert send(client, owner, 0, audio=b"x" * 50).status_code == 400
    assert send(client, owner, 0).status_code == 201
