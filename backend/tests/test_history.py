"""면접 기록: 같은 질문으로 다시 하기(retry)와 대시보드 통계(stats) (docs/PLAN.md 8장 ⑦)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.ai.providers import get_chat_model
from app.interviews.models import Interview, InterviewAnswer, InterviewQuestion, InterviewStatus
from app.main import app
from tests.test_answers import add_interview, signup
from tests.test_interviews import FakeModel, create, other_user_headers, reset_rate_limiter, use_settings  # noqa: F401


@pytest.fixture
def model(client) -> FakeModel:
    fake = FakeModel()
    app.dependency_overrides[get_chat_model] = lambda: fake
    return fake


def retry(client, headers, interview_id):
    return client.post(f"/api/interviews/{interview_id}/retry", headers=headers)


def questions_of(detail: dict) -> list[tuple]:
    return [(q["seq"], q["category"], q["text"], q["intent"], q["expectedPoints"]) for q in detail["questions"]]


# ---- retry ----


def test_retry_copies_the_questions_into_a_new_ready_interview(client, auth_headers, model):
    original = create(client, auth_headers, jobPosting="Spring Boot 우대", prepSeconds=30).json()
    calls = len(model.calls)

    res = retry(client, auth_headers, original["id"])
    assert res.status_code == 201, res.text
    copy = res.json()

    assert copy["id"] != original["id"]
    assert copy["status"] == "READY" and copy["answeredCount"] == 0 and copy["overallScore"] is None
    assert copy["startedAt"] is None and copy["completedAt"] is None and copy["report"] is None
    assert (
        copy["title"] == original["title"] and copy["field"] == original["field"] and copy["level"] == original["level"]
    )
    assert copy["jobPosting"] == "Spring Boot 우대" and copy["prepSeconds"] == 30
    assert questions_of(copy) == questions_of(original)  # 같은 질문, 같은 순서
    assert {q["id"] for q in copy["questions"]}.isdisjoint({q["id"] for q in original["questions"]})  # 새 행
    assert len(model.calls) == calls  # AI 를 부르지 않는다


def test_retry_of_a_completed_interview_does_not_copy_answers_or_scores(client, db_session_factory):
    headers, user_id = signup(client)
    source = add_interview(db_session_factory, user_id, status=InterviewStatus.COMPLETED)
    with db_session_factory() as db:
        interview = db.get(Interview, source["id"])
        interview.overall_score = 77
        interview.report = {"overallScore": 77}
        for question_id in source["questions"]:
            db.add(InterviewAnswer(question_id=question_id, interview_id=source["id"], transcript="답변", score=70))
        db.commit()

    copy = retry(client, headers, source["id"]).json()
    assert copy["status"] == "READY" and copy["report"] is None and copy["overallScore"] is None
    assert all(q["answer"] is None for q in copy["questions"])
    assert [q["text"] for q in copy["questions"]] == ["자기소개를 해 주세요.", "REST 란?", "마지막으로 한마디?"]
    with db_session_factory() as db:  # 원본은 그대로
        assert db.get(Interview, source["id"]).status == InterviewStatus.COMPLETED
        assert db.scalar(select(func.count()).select_from(InterviewAnswer)) == 3
        assert db.scalar(select(func.count()).select_from(InterviewQuestion)) == 6


def test_retried_interview_can_be_fetched_and_listed(client, auth_headers, model):
    original = create(client, auth_headers).json()
    copy = retry(client, auth_headers, original["id"]).json()
    assert client.get(f"/api/interviews/{copy['id']}", headers=auth_headers).status_code == 200
    listed = client.get("/api/interviews", headers=auth_headers).json()
    assert listed["total"] == 2 and listed["items"][0]["id"] == copy["id"]  # 새로 만든 것이 맨 위


def test_retry_counts_toward_the_daily_limit(client, auth_headers, model):
    use_settings(interview_daily_limit=2)
    original = create(client, auth_headers).json()
    assert retry(client, auth_headers, original["id"]).status_code == 201
    res = retry(client, auth_headers, original["id"])
    assert res.status_code == 429 and res.json()["message"] == "오늘 만들 수 있는 면접 수를 초과했습니다."


def test_retry_does_not_use_the_ai_rate_limit(client, auth_headers, model):
    use_settings(interview_ai_rate_per_minute=1, interview_daily_limit=50)
    original = create(client, auth_headers).json()  # 한도 1회를 다 씀
    assert retry(client, auth_headers, original["id"]).status_code == 201  # AI 를 쓰지 않으니 막히지 않음


def test_retry_requires_login_and_ownership(client, auth_headers, model):
    original = create(client, auth_headers).json()
    assert client.post(f"/api/interviews/{original['id']}/retry").status_code == 401
    res = retry(client, other_user_headers(client), original["id"])
    assert res.status_code == 404 and res.json()["message"] == "면접을 찾을 수 없습니다."
    assert retry(client, auth_headers, 999_999).status_code == 404
    assert client.get("/api/interviews", headers=auth_headers).json()["total"] == 1  # 남이 복사하지 못했다


# ---- stats ----


def add_completed(db_session_factory, user_id: int, score: int | None, days_ago: int, title: str = "면접") -> int:
    with db_session_factory() as db:
        done_at = datetime.now(UTC) - timedelta(days=days_ago)
        interview = Interview(
            user_id=user_id,
            title=title,
            field="백엔드",
            level="NEWCOMER",
            question_count=3,
            status=InterviewStatus.COMPLETED,
            overall_score=score,
            created_at=done_at - timedelta(hours=1),
            completed_at=done_at,
        )
        db.add(interview)
        db.commit()
        return interview.id


def test_stats_for_a_new_user_is_empty(client, auth_headers):
    res = client.get("/api/interviews/stats", headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == {"completedCount": 0, "averageScore": None, "recent": []}


def test_stats_counts_completed_interviews_and_averages_the_scores(client, db_session_factory):
    headers, user_id = signup(client)
    add_completed(db_session_factory, user_id, 60, 3)
    add_completed(db_session_factory, user_id, 81, 2)
    add_completed(db_session_factory, user_id, None, 1)  # 점수가 없는 면접은 세지 않는다
    add_interview(db_session_factory, user_id, status=InterviewStatus.IN_PROGRESS)  # 끝나지 않은 면접도 제외

    body = client.get("/api/interviews/stats", headers=headers).json()
    assert body["completedCount"] == 2
    assert body["averageScore"] == 71  # (60 + 81) / 2 = 70.5 → 반올림
    assert [r["score"] for r in body["recent"]] == [60, 81]  # 오래된 것부터
    assert set(body["recent"][0]) == {"id", "title", "score", "completedAt"}


def test_stats_recent_keeps_the_latest_ten_oldest_first(client, db_session_factory):
    headers, user_id = signup(client)
    for i in range(12):
        add_completed(db_session_factory, user_id, 50 + i, days_ago=12 - i, title=f"면접 {i}")
    body = client.get("/api/interviews/stats", headers=headers).json()
    assert body["completedCount"] == 12
    assert [r["score"] for r in body["recent"]] == [52 + i for i in range(10)]  # 가장 최근 10개, 오래된 것부터
    assert body["recent"][-1]["title"] == "면접 11"


def test_stats_only_counts_own_interviews(client, db_session_factory):
    mine, my_id = signup(client)
    _, other_id = signup(client)
    add_completed(db_session_factory, my_id, 90, 1)
    add_completed(db_session_factory, other_id, 10, 1)
    body = client.get("/api/interviews/stats", headers=mine).json()
    assert body["completedCount"] == 1 and body["averageScore"] == 90


def test_stats_requires_login_and_is_not_confused_with_an_interview_id(client, auth_headers):
    assert client.get("/api/interviews/stats").status_code == 401
    # /stats 는 /{id} 보다 먼저 선언되어 정수 id 로 해석되지 않는다
    assert client.get("/api/interviews/stats", headers=auth_headers).status_code == 200
