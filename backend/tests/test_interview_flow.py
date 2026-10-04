"""면접 시작(start)과 종료(finish) 흐름 (docs/PLAN.md 8장 ⑤)."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.ai.providers import get_chat_model
from app.ai.speech import get_speech_to_text
from app.interviews.models import Interview, InterviewAnswer, InterviewStatus
from app.main import app
from tests.fake_ai import FakeAi
from tests.test_answers import WEBM, FakeSTT, add_interview, send, signup
from tests.test_answers import reset_rate_limiter as _reset_rate_limiter  # noqa: F401  (autouse)

CONSENT_VERSION = "2026-10-v1"
BASELINE = {
    "yawDeg": 1.8,
    "pitchDeg": 4.9,
    "eyeH": -0.09,
    "eyeV": -0.04,
    "smile": 0.2,
    "poseAvailable": True,
    "shoulderTiltDeg": -2.7,
    "shoulderWidth": 0.38,
    "shoulderMidY": 0.43,
    "neckRatio": 0.55,
}


def start_body(**overrides) -> dict:
    return {
        "consent": True,
        "consentVersion": CONSENT_VERSION,
        "nonverbalEnabled": True,
        "baseline": BASELINE,
        **overrides,
    }


def start(client, headers, interview_id, **overrides):
    return client.post(f"/api/interviews/{interview_id}/start", json=start_body(**overrides), headers=headers)


def finish(client, headers, interview_id):
    return client.post(f"/api/interviews/{interview_id}/finish", headers=headers)


@pytest.fixture
def ready(client, db_session_factory):
    """시작 전(READY)인 내 면접 하나: (헤더, 면접)"""
    headers, user_id = signup(client)
    return headers, add_interview(db_session_factory, user_id, status=InterviewStatus.READY)


@pytest.fixture(autouse=True)
def ai(client) -> FakeAi:
    """종료(finish)가 피드백·리포트를 만들므로 가짜 AI 를 끼웁니다 (자세한 검증은 test_feedback.py)."""
    fake = FakeAi()
    app.dependency_overrides[get_chat_model] = lambda: fake
    return fake


@pytest.fixture
def stt(client) -> FakeSTT:
    fake = FakeSTT()
    app.dependency_overrides[get_speech_to_text] = lambda: fake
    return fake


def stored(db_session_factory, interview_id: int) -> Interview:
    with db_session_factory() as db:
        return db.get(Interview, interview_id)


# ---- start ----


def test_start_moves_ready_to_in_progress_and_records_consent(client, ready, db_session_factory):
    headers, interview = ready
    before = datetime.now(UTC)
    res = start(client, headers, interview["id"])

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "IN_PROGRESS"
    assert body["startedAt"] is not None and body["completedAt"] is None
    assert body["nonverbalEnabled"] is True

    row = stored(db_session_factory, interview["id"])
    assert row.status == InterviewStatus.IN_PROGRESS
    assert row.consented_at is not None and row.consented_at >= before.replace(microsecond=0)
    assert row.consent_version == CONSENT_VERSION
    assert row.started_at is not None
    assert row.baseline["yawDeg"] == 1.8 and row.baseline["poseAvailable"] is True


def test_intent_is_hidden_after_start(client, ready):
    headers, interview = ready
    assert all(
        q["intent"] for q in client.get(f"/api/interviews/{interview['id']}", headers=headers).json()["questions"]
    )
    detail = start(client, headers, interview["id"]).json()
    assert all(q["intent"] is None and q["expectedPoints"] is None for q in detail["questions"])  # 진행 중에는 숨김


def test_start_without_baseline_and_with_nonverbal_off(client, ready, db_session_factory):
    headers, interview = ready
    res = start(client, headers, interview["id"], nonverbalEnabled=False, baseline=None)
    assert res.status_code == 200 and res.json()["nonverbalEnabled"] is False
    assert stored(db_session_factory, interview["id"]).baseline is None


def test_baseline_is_not_stored_when_analysis_is_off(client, ready, db_session_factory):
    headers, interview = ready
    start(client, headers, interview["id"], nonverbalEnabled=False, baseline=BASELINE)
    assert stored(db_session_factory, interview["id"]).baseline is None


def test_baseline_without_shoulders_is_accepted(client, ready, db_session_factory):
    headers, interview = ready
    baseline = {**BASELINE, "poseAvailable": False, "shoulderTiltDeg": None, "shoulderWidth": None,
                "shoulderMidY": None, "neckRatio": None}  # fmt: skip
    assert start(client, headers, interview["id"], baseline=baseline).status_code == 200
    assert stored(db_session_factory, interview["id"]).baseline["poseAvailable"] is False


def test_starting_again_keeps_the_state_and_updates_the_baseline(client, ready, db_session_factory):
    headers, interview = ready
    first = start(client, headers, interview["id"]).json()
    second = start(client, headers, interview["id"], baseline={**BASELINE, "yawDeg": 9.5})
    assert second.status_code == 200
    assert second.json()["status"] == "IN_PROGRESS"
    assert second.json()["startedAt"] == first["startedAt"]  # 처음 시작한 시각은 그대로
    assert stored(db_session_factory, interview["id"]).baseline["yawDeg"] == 9.5


def test_consent_is_required(client, ready, db_session_factory):
    headers, interview = ready
    res = start(client, headers, interview["id"], consent=False)
    assert res.status_code == 400
    assert res.json()["message"] == "안내 내용에 동의해야 면접을 시작할 수 있습니다."
    assert "consent" in res.json()["errors"]
    row = stored(db_session_factory, interview["id"])
    assert row.status == InterviewStatus.READY and row.consented_at is None  # 상태가 바뀌지 않는다


def test_missing_consent_field_is_400(client, ready):
    headers, interview = ready
    body = start_body()
    del body["consent"]
    res = client.post(f"/api/interviews/{interview['id']}/start", json=body, headers=headers)
    assert res.status_code == 400 and "consent" in res.json()["errors"]


def test_consent_version_must_match_the_current_notice(client, ready):
    headers, interview = ready
    res = start(client, headers, interview["id"], consentVersion="2020-01-old")
    assert res.status_code == 400 and "consentVersion" in res.json()["errors"]
    assert "안내 문구가 바뀌었습니다" in res.json()["message"]
    res = client.post(
        f"/api/interviews/{interview['id']}/start", json={"consent": True, "consentVersion": ""}, headers=headers
    )
    assert res.status_code == 400


@pytest.mark.parametrize(
    "baseline",
    [{**BASELINE, "yawDeg": 400}, {**BASELINE, "smile": 2}, {**BASELINE, "poseAvailable": "maybe"}, {"yawDeg": 1}],
)
def test_invalid_baseline_is_400(client, ready, baseline):
    headers, interview = ready
    assert start(client, headers, interview["id"], baseline=baseline).status_code == 400


def test_starting_a_completed_interview_is_409(client, ready, db_session_factory):
    headers, interview = ready
    with db_session_factory() as db:
        db.get(Interview, interview["id"]).status = InterviewStatus.COMPLETED
        db.commit()
    res = start(client, headers, interview["id"])
    assert res.status_code == 409 and res.json()["message"] == "이미 종료된 면접입니다."
    # 동의하지 않았더라도 끝난 면접은 409 가 먼저다
    assert start(client, headers, interview["id"], consent=False).status_code == 409


def test_start_requires_login_and_ownership(client, ready):
    _, interview = ready
    assert client.post(f"/api/interviews/{interview['id']}/start", json=start_body()).status_code == 401
    other, _ = signup(client)
    res = start(client, other, interview["id"])
    assert res.status_code == 404 and res.json()["message"] == "면접을 찾을 수 없습니다."
    assert start(client, other, 999_999).status_code == 404


# ---- finish ----


def answer_all(client, owner, count: int = 3):
    for index in range(count):
        assert send(client, owner, index).status_code == 201


def test_finish_requires_the_interview_to_be_started(client, ready):
    headers, interview = ready
    res = finish(client, headers, interview["id"])
    assert res.status_code == 409 and "아직 시작되지 않았습니다" in res.json()["message"]


def test_finish_requires_every_question_to_be_answered(client, ready, stt, db_session_factory):
    headers, interview = ready
    start(client, headers, interview["id"])
    assert send(client, (headers, interview), 0).status_code == 201

    res = finish(client, headers, interview["id"])
    assert res.status_code == 409
    assert res.json()["message"] == "아직 답변하지 않은 질문이 2개 있습니다. (2, 3번)"
    assert stored(db_session_factory, interview["id"]).status == InterviewStatus.IN_PROGRESS


def test_finish_completes_the_interview(client, ready, stt, db_session_factory):
    headers, interview = ready
    start(client, headers, interview["id"])
    answer_all(client, (headers, interview))

    res = finish(client, headers, interview["id"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "COMPLETED"
    assert body["completedAt"] is not None
    assert body["answeredCount"] == 3
    # 끝난 면접에서는 평가 의도가 다시 보인다
    assert all(q["intent"] for q in body["questions"])
    assert all(q["answer"]["speech"]["metrics"]["wordCount"] == 27 for q in body["questions"])
    row = stored(db_session_factory, interview["id"])
    assert row.status == InterviewStatus.COMPLETED and row.completed_at is not None


def test_finish_is_idempotent(client, ready, stt):
    headers, interview = ready
    start(client, headers, interview["id"])
    answer_all(client, (headers, interview))
    first = finish(client, headers, interview["id"]).json()
    second = finish(client, headers, interview["id"])
    assert second.status_code == 200
    assert second.json()["completedAt"] == first["completedAt"]  # 끝난 시각은 처음 값 그대로


def test_nothing_can_be_added_after_finish(client, ready, stt):
    headers, interview = ready
    start(client, headers, interview["id"])
    answer_all(client, (headers, interview))
    finish(client, headers, interview["id"])

    stt.calls.clear()
    assert send(client, (headers, interview), 0).status_code == 409  # 답변 덮어쓰기도 안 된다
    assert start(client, headers, interview["id"]).status_code == 409  # 다시 시작도 안 된다
    assert stt.calls == []


def test_finish_requires_login_and_ownership(client, ready):
    _, interview = ready
    assert client.post(f"/api/interviews/{interview['id']}/finish").status_code == 401
    other, _ = signup(client)
    assert finish(client, other, interview["id"]).status_code == 404
    assert finish(client, other, 999_999).status_code == 404


def test_list_shows_progress_through_the_flow(client, ready, stt):
    headers, interview = ready

    def summary():
        return client.get("/api/interviews", headers=headers).json()["items"][0]

    assert summary()["status"] == "READY" and summary()["answeredCount"] == 0
    start(client, headers, interview["id"])
    assert summary()["status"] == "IN_PROGRESS"
    answer_all(client, (headers, interview))
    assert summary()["answeredCount"] == 3
    finish(client, headers, interview["id"])
    assert summary()["status"] == "COMPLETED" and summary()["completedAt"] is not None
    assert client.get("/api/interviews?status=COMPLETED", headers=headers).json()["total"] == 1


def test_resending_an_answer_during_the_interview_overwrites_it(client, ready, stt, db_session_factory):
    """다시 보내기(업로드 재시도)는 같은 답변을 덮어쓰므로 질문당 답변은 항상 하나다."""
    headers, interview = ready
    start(client, headers, interview["id"])
    assert send(client, (headers, interview), 0, audio=WEBM).status_code == 201
    assert send(client, (headers, interview), 0, audio=WEBM).status_code == 200
    with db_session_factory() as db:
        assert len(db.scalars(select(InterviewAnswer)).all()) == 1
