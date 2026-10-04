"""면접 기능 리뷰에서 나온 동시성·개인정보·입력 처리 보강 (면접 기록과 업로드 경로)."""

import logging

import pytest
from sqlalchemy import select

from app.ai.providers import get_chat_model, response_shape
from app.ai.speech import Transcription, WordTiming, get_speech_to_text
from app.interviews.models import Interview, InterviewAnswer, InterviewStatus
from app.main import app
from tests.fake_ai import FakeAi
from tests.test_answers import NONVERBAL, FakeSTT, add_interview, send, signup, use_settings
from tests.test_answers import reset_rate_limiter as _reset_rate_limiter  # noqa: F401  (autouse)


@pytest.fixture
def ai(client) -> FakeAi:
    fake = FakeAi()
    app.dependency_overrides[get_chat_model] = lambda: fake
    return fake


@pytest.fixture
def owner(client, db_session_factory):
    headers, user_id = signup(client)
    return headers, add_interview(db_session_factory, user_id)


class HookedSTT(FakeSTT):
    """음성 인식을 기다리는 동안 다른 일이 일어나는 상황을 흉내 냅니다 (hook 이 transcribe 안에서 실행됨)."""

    def __init__(self, hook, result: Transcription | None = None) -> None:
        super().__init__(result)
        self.hook = hook

    def transcribe(self, audio, **kwargs):
        self.hook()
        return super().transcribe(audio, **kwargs)


def install(stt) -> None:
    app.dependency_overrides[get_speech_to_text] = lambda: stt


# ---- 음성 인식 중에 면접이 끝난 경우 ----


def test_answer_arriving_after_the_interview_finished_is_rejected(client, owner, ai, db_session_factory):
    _, interview = owner

    def finish_meanwhile():
        with db_session_factory() as db:
            db.get(Interview, interview["id"]).status = InterviewStatus.COMPLETED
            db.commit()

    install(HookedSTT(finish_meanwhile))
    res = send(client, owner, 0)
    assert res.status_code == 409 and res.json()["message"] == "이미 종료된 면접입니다."
    with db_session_factory() as db:
        assert db.scalars(select(InterviewAnswer)).all() == []  # 끝난 면접에 답변이 끼어들지 않는다
    assert ai.calls == []  # 피드백도 만들지 않는다


def test_answer_for_an_interview_deleted_meanwhile_is_404(client, owner, ai, db_session_factory):
    _, interview = owner

    def delete_meanwhile():
        with db_session_factory() as db:
            db.delete(db.get(Interview, interview["id"]))
            db.commit()

    install(HookedSTT(delete_meanwhile))
    assert send(client, owner, 0).status_code == 404


# ---- 같은 질문의 동시 업로드 ----


def test_overlapping_uploads_of_the_same_question_end_with_one_answer(client, owner, ai, db_session_factory):
    _, interview = owner
    question_id = interview["questions"][0]

    def other_upload_wins_the_race():
        with db_session_factory() as db:
            db.add(
                InterviewAnswer(question_id=question_id, interview_id=interview["id"], transcript="먼저 도착한 답변")
            )
            db.commit()

    install(HookedSTT(other_upload_wins_the_race))
    res = send(client, owner, 0)
    # unique 위반으로 실패시키지 않고 기존 답변을 덮어쓴다 (재시도가 겹쳐도 사용자에게 오류가 보이지 않음)
    assert res.status_code == 200, res.text
    assert res.json()["transcript"].startswith("음 저는 백엔드")
    with db_session_factory() as db:
        rows = db.scalars(select(InterviewAnswer)).all()
        assert len(rows) == 1 and rows[0].transcript.startswith("음 저는 백엔드")


# ---- 개인정보: 단어별 기록 ----


def spaced_phone() -> Transcription:
    words = [
        WordTiming(w, 0.5 * i, 0.5 * i + 0.4)
        for i, w in enumerate(["제", "전화번호는", "010", "1234", "5678", "이고", "감사합니다"])
    ]
    return Transcription(
        text="제 전화번호는 010 1234 5678 이고 감사합니다",
        words=words,
        duration=8.0,
        language="korean",
        no_speech_probs=[0.01],
    )


def test_words_split_across_tokens_are_masked_in_stored_words(client, owner, ai, db_session_factory):
    install(FakeSTT(spaced_phone()))
    body = send(client, owner, 0, duration_ms=8000).json()
    assert "[전화번호]" in body["transcript"] and "1234" not in body["transcript"]
    with db_session_factory() as db:
        words = [w["w"] for w in db.scalar(select(InterviewAnswer)).words]
    assert not {"010", "1234", "5678"} & set(words)  # 쪼개진 번호가 단어 기록에 남지 않는다
    assert "제" in words and "감사합니다" in words  # 나머지 단어는 그대로
    assert body["speech"]["metrics"]["wordCount"] == 7  # 지표는 원문으로 계산한다


def test_words_without_personal_data_are_kept_as_is(client, owner, ai, db_session_factory):
    install(FakeSTT())
    send(client, owner, 0)
    with db_session_factory() as db:
        assert "백엔드" in [w["w"] for w in db.scalar(select(InterviewAnswer)).words]


# ---- 비언어 지표: 분석을 끈 면접 ----


def test_nonverbal_metrics_are_ignored_when_the_interview_has_analysis_off(client, owner, ai, db_session_factory):
    _, interview = owner
    with db_session_factory() as db:
        db.get(Interview, interview["id"]).nonverbal_enabled = False
        db.commit()
    install(FakeSTT())
    body = send(client, owner, 0, nonverbal=NONVERBAL).json()
    assert body["nonverbal"] is None
    # 잘못된 값이어도 분석을 끈 면접에서는 읽지 않는다
    assert send(client, owner, 1, nonverbal="이건 JSON 이 아님").status_code == 201
    with db_session_factory() as db:
        assert all(a.nonverbal_metrics is None for a in db.scalars(select(InterviewAnswer)))


# ---- 시간 초과 판정 ----


def test_timed_out_uses_the_longer_of_client_and_server_duration(client, owner, ai):
    long_audio = Transcription(
        text="음 " * 10,
        words=[WordTiming("말", 1.0, 2.0)] * 10,
        duration=119.9,
        language="korean",
        no_speech_probs=[0.0],
    )
    install(FakeSTT(long_audio))
    # 클라이언트가 짧게 보내도 서버가 잰 오디오가 최대 시간에 닿았으면 시간 초과
    assert send(client, owner, 0, duration_ms=10_000).json()["timedOut"] is True


# ---- 로그에 답변 본문이 남지 않는다 ----


def test_response_shape_never_includes_the_content():
    assert response_shape({"text": "비밀 답변", "words": []}) == "키: text, words"
    assert "비밀" not in response_shape(["비밀 답변"]) and response_shape(["x"]) == "형식: list"


def test_malformed_speech_response_does_not_log_the_transcript(monkeypatch, caplog):
    import httpx

    from app.ai.config import AiSettings
    from app.ai.providers import ModelError
    from app.ai.speech import OpenAISpeechToText

    class Reply:
        status_code = 200
        text = ""

        def json(self):
            return {"text": "비밀 답변 010 1234 5678", "words": "이상한 형식", "duration": "x"}

    monkeypatch.setattr(httpx, "post", lambda *a, **k: Reply())
    stt = OpenAISpeechToText("http://stt", "key", "whisper-1", AiSettings(_env_file=None))
    with pytest.raises(ModelError) as info, caplog.at_level(logging.DEBUG):
        stt.transcribe(b"\x1a\x45\xdf\xa3", filename="answer.webm", content_type="audio/webm")
    assert "비밀" not in str(info.value) and "1234" not in str(info.value)
    assert "비밀" not in caplog.text


# ---- 종합 리포트가 겹쳐 만들어져도 하나 ----


def test_report_created_by_an_overlapping_request_is_kept(client, owner, ai, db_session_factory):
    _, interview = owner
    install(FakeSTT())
    for index in range(3):
        assert send(client, owner, index).status_code == 201
    first_report = {"overallScore": 1, "summary": "먼저 끝난 요청의 리포트"}
    original_complete = ai.complete

    def complete(system, messages):
        if "종합 리포트" in system:  # 리포트를 만드는 동안 다른 요청이 먼저 저장
            with db_session_factory() as db:
                row = db.get(Interview, interview["id"])
                row.report, row.overall_score = first_report, 1
                db.commit()
        return original_complete(system, messages)

    ai.complete = complete
    res = client.post(f"/api/interviews/{interview['id']}/finish", headers=owner[0])
    assert res.status_code == 200
    assert res.json()["report"]["summary"] == "먼저 끝난 요청의 리포트" and res.json()["overallScore"] == 1


def test_unexpected_feedback_shape_gives_502_not_500(client, owner, ai, db_session_factory):
    _, interview = owner
    install(FakeSTT())
    for index in range(3):
        assert send(client, owner, index).status_code == 201
    with db_session_factory() as db:  # 예전 형식의 피드백이 남아 있는 경우
        for answer in db.scalars(select(InterviewAnswer)):
            answer.feedback = {"summary": "옛날 형식"}
        db.commit()
    res = client.post(f"/api/interviews/{interview['id']}/finish", headers=owner[0])
    assert res.status_code == 502


# ---- 하루 한도를 질문 생성 중에 채운 경우 ----


def test_daily_limit_is_checked_again_after_question_generation(client, auth_headers, db_session_factory):
    from tests.test_interviews import CREATE, FakeModel

    use_settings(interview_daily_limit=1)
    me = client.get("/api/users/me", headers=auth_headers).json()["id"]

    class RacingModel(FakeModel):
        def complete(self, system, messages):
            reply = super().complete(system, messages)
            add_interview(db_session_factory, me)  # 질문을 만드는 동안 다른 요청이 하루 한도를 채움
            return reply

    app.dependency_overrides[get_chat_model] = lambda: RacingModel()
    res = client.post("/api/interviews", json=CREATE, headers=auth_headers)
    assert res.status_code == 429
    with db_session_factory() as db:
        assert len(db.scalars(select(Interview)).all()) == 1  # 한도를 넘는 면접은 만들어지지 않았다
