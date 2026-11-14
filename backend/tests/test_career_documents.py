"""취업 도우미: 이력서·자기소개서·포트폴리오 API (docs/PLAN.md 12장)."""

import json
from collections.abc import Iterator

import pytest

from app.ai.providers import Message, ModelError, get_chat_model
from app.interviews.ratelimit import ai_limiter
from app.main import app
from tests.conftest import TEST_PASSWORD, unique_email
from tests.fake_ai import payload_of


class FakeCareerAi:
    """system 프롬프트로 종류를 알아보고 정상 JSON 을 돌려줍니다. 받은 입력은 calls 에 남깁니다."""

    def __init__(self) -> None:
        self.fail = False
        self.calls: list[dict] = []

    def complete(self, system: str, messages: list[Message]) -> str:
        if self.fail:
            raise ModelError("가짜 실패")
        payload = payload_of(messages[0]["content"])
        self.calls.append(payload)
        if "이력서를 지원 직무" in system:
            reply = {
                "score": 72,
                "overall": "기술 스택은 좋지만 성과 수치가 부족합니다.",
                "strengths": ["프로젝트 경험이 직무와 맞습니다."],
                "improvements": [{"section": "projects", "point": "성과가 없음", "suggestion": "수치를 넣으세요."}],
                "suggestedSummary": "백엔드 개발자를 지망합니다.",
                "missingKeywords": ["Docker", "CI/CD"],
            }
        elif "답변 초안" in system:
            reply = {"draft": "저는 [수치 입력] 만큼 성능을 개선했습니다."}
        elif "자기소개서의 문항별" in system:
            reply = {
                "overall": "전반적으로 구체적입니다.",
                "items": [
                    {"index": 99, "score": 10, "comment": "없는 문항", "suggestions": [], "revised": ""},
                    {
                        "index": 0,
                        "score": 80,
                        "comment": "좋습니다.",
                        "suggestions": ["결론 먼저"],
                        "revised": "수정안",
                    },
                ],
            }
        else:
            reply = {
                "polishedDescription": "다듬은 설명",
                "resumeBullets": ["API 응답 시간을 [수치 입력] 줄임"],
                "expectedQuestions": [{"question": "왜 Redis 를 썼나요?", "intent": "기술 선택 근거"}],
                "tips": ["README 에 아키텍처 그림 추가"],
            }
        return json.dumps(reply, ensure_ascii=False)


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> Iterator[None]:
    ai_limiter.reset()
    yield
    ai_limiter.reset()


@pytest.fixture
def fake_ai(client) -> FakeCareerAi:
    fake = FakeCareerAi()
    app.dependency_overrides[get_chat_model] = lambda: fake
    return fake


def other_user_headers(client) -> dict[str, str]:
    email = unique_email("other")
    client.post("/api/auth/signup", json={"email": email, "password": TEST_PASSWORD, "name": "다른"})
    token = client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD}).json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


RESUME = {
    "title": "백엔드 신입 이력서",
    "targetRole": "백엔드 개발자",
    "content": {
        "name": "홍길동",
        "email": "hong@example.com",
        "phone": "010-1234-5678",
        "summary": "문의는 010-9999-8888 로 주세요. 서버 개발을 좋아합니다.",
        "skills": ["Python", "FastAPI"],
        "projects": [{"name": "예약 서비스", "techStack": ["FastAPI"], "description": "예약 API 개발"}],
    },
}

COVER_LETTER = {
    "title": "A사 지원",
    "company": "A사",
    "targetRole": "프론트엔드 개발자",
    "items": [
        {"question": "지원 동기를 쓰세요.", "answer": "사용자 경험을 개선하고 싶습니다.", "charLimit": 500},
        {"question": "협업 경험", "answer": ""},
    ],
}

PORTFOLIO = {
    "title": "실시간 채팅",
    "summary": "WebSocket 채팅",
    "techStack": ["React", " Node.js ", ""],
    "description": "채팅 서버를 만들었습니다.",
    "githubUrl": "https://github.com/example/chat",
    "featured": True,
}


# --- 공통 CRUD 계약 ---------------------------------------------------------------

CASES = [
    ("/api/resumes", RESUME, {"title": "새 제목", "targetRole": "데이터 엔지니어"}),
    ("/api/cover-letters", COVER_LETTER, {**COVER_LETTER, "title": "새 제목"}),
    ("/api/portfolios", PORTFOLIO, {**PORTFOLIO, "title": "새 제목"}),
]


@pytest.mark.parametrize(("base", "body", "updated"), CASES)
def test_crud_flow(client, auth_headers, base, body, updated):
    res = client.post(base, json=body, headers=auth_headers)
    assert res.status_code == 201, res.text
    created = res.json()
    assert {"id", "title", "createdAt", "updatedAt"} <= created.keys()
    item_id = created["id"]

    listed = client.get(base, headers=auth_headers).json()
    assert [r["id"] for r in listed] == [item_id]

    assert client.get(f"{base}/{item_id}", headers=auth_headers).json()["title"] == body["title"]

    res = client.put(f"{base}/{item_id}", json=updated, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "새 제목"

    assert client.delete(f"{base}/{item_id}", headers=auth_headers).status_code == 204
    res = client.get(f"{base}/{item_id}", headers=auth_headers)
    assert res.status_code == 404
    assert res.json()["message"]


@pytest.mark.parametrize(("base", "body", "updated"), CASES)
def test_requires_login(client, base, body, updated):
    assert client.get(base).status_code == 401
    assert client.post(base, json=body).status_code == 401


@pytest.mark.parametrize(("base", "body", "updated"), CASES)
def test_blank_title_is_400(client, auth_headers, base, body, updated):
    res = client.post(base, json={**body, "title": "  "}, headers=auth_headers)
    assert res.status_code == 400
    assert "title" in res.json()["errors"]


@pytest.mark.parametrize(("base", "body", "updated"), CASES)
def test_other_users_document_is_hidden(client, auth_headers, base, body, updated):
    item_id = client.post(base, json=body, headers=auth_headers).json()["id"]
    other = other_user_headers(client)
    assert client.get(base, headers=other).json() == []
    assert client.get(f"{base}/{item_id}", headers=other).status_code == 404
    assert client.put(f"{base}/{item_id}", json=updated, headers=other).status_code == 404
    assert client.delete(f"{base}/{item_id}", headers=other).status_code == 404


# --- 도메인별 검증 -------------------------------------------------------------------


def test_resume_content_round_trip_camel_case(client, auth_headers):
    body = client.post("/api/resumes", json=RESUME, headers=auth_headers).json()
    assert body["content"]["projects"][0]["techStack"] == ["FastAPI"]
    assert body["content"]["experiences"] == []
    assert body["review"] is None and body["reviewedAt"] is None


def test_cover_letter_validation(client, auth_headers):
    res = client.post("/api/cover-letters", json={**COVER_LETTER, "items": []}, headers=auth_headers)
    assert res.status_code == 400 and "items" in res.json()["errors"]
    bad_limit = {**COVER_LETTER, "items": [{"question": "문항", "charLimit": 10}]}
    res = client.post("/api/cover-letters", json=bad_limit, headers=auth_headers)
    assert res.status_code == 400


def test_portfolio_validation_and_cleanup(client, auth_headers):
    res = client.post("/api/portfolios", json={**PORTFOLIO, "githubUrl": "javascript:alert(1)"}, headers=auth_headers)
    assert res.status_code == 400
    assert res.json()["errors"]["githubUrl"] == "http:// 또는 https:// 로 시작하는 주소를 입력해 주세요."

    body = client.post("/api/portfolios", json=PORTFOLIO, headers=auth_headers).json()
    assert body["techStack"] == ["React", "Node.js"]
    assert body["teamSize"] is None and body["featured"] is True


def test_portfolio_list_puts_featured_first(client, auth_headers):
    first = client.post("/api/portfolios", json=PORTFOLIO, headers=auth_headers).json()["id"]
    client.post("/api/portfolios", json={**PORTFOLIO, "title": "일반", "featured": False}, headers=auth_headers)
    assert client.get("/api/portfolios", headers=auth_headers).json()[0]["id"] == first


# --- AI 도움 -----------------------------------------------------------------------


def test_resume_review_saves_result_and_hides_contacts(client, auth_headers, fake_ai):
    resume_id = client.post("/api/resumes", json=RESUME, headers=auth_headers).json()["id"]
    res = client.post(f"/api/resumes/{resume_id}/review", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["review"]["score"] == 72
    assert body["review"]["missingKeywords"] == ["Docker", "CI/CD"]
    assert body["reviewedAt"]

    sent = json.dumps(fake_ai.calls[0], ensure_ascii=False)
    assert "홍길동" not in sent and "hong@example.com" not in sent and "010-1234-5678" not in sent
    assert "010-9999-8888" not in sent  # 자유 텍스트 안의 전화번호도 가립니다.

    listed = client.get("/api/resumes", headers=auth_headers).json()
    assert listed[0]["reviewScore"] == 72


def test_ai_failure_is_502_and_keeps_document(client, auth_headers, fake_ai):
    resume_id = client.post("/api/resumes", json=RESUME, headers=auth_headers).json()["id"]
    fake_ai.fail = True
    res = client.post(f"/api/resumes/{resume_id}/review", headers=auth_headers)
    assert res.status_code == 502
    assert res.json()["message"] == "AI 첨삭을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
    assert client.get(f"/api/resumes/{resume_id}", headers=auth_headers).json()["review"] is None


def test_cover_letter_draft_is_not_saved(client, auth_headers, fake_ai):
    letter_id = client.post("/api/cover-letters", json=COVER_LETTER, headers=auth_headers).json()["id"]
    res = client.post(
        f"/api/cover-letters/{letter_id}/draft",
        json={"itemIndex": 1, "notes": "동아리에서 3명과 웹 서비스를 만들었습니다."},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["draft"].startswith("저는")
    assert fake_ai.calls[0]["question"] == "협업 경험"
    assert client.get(f"/api/cover-letters/{letter_id}", headers=auth_headers).json()["items"][1]["answer"] == ""

    res = client.post(
        f"/api/cover-letters/{letter_id}/draft", json={"itemIndex": 5, "notes": "메모"}, headers=auth_headers
    )
    assert res.status_code == 400
    res = client.post(f"/api/cover-letters/{letter_id}/draft", json={"itemIndex": 0, "notes": ""}, headers=auth_headers)
    assert res.status_code == 400 and "notes" in res.json()["errors"]


def test_cover_letter_review_keeps_only_answered_items(client, auth_headers, fake_ai):
    letter_id = client.post("/api/cover-letters", json=COVER_LETTER, headers=auth_headers).json()["id"]
    res = client.post(f"/api/cover-letters/{letter_id}/review", headers=auth_headers)
    assert res.status_code == 200, res.text
    review = res.json()["review"]
    assert [i["index"] for i in review["items"]] == [0]
    assert [i["index"] for i in fake_ai.calls[0]["items"]] == [0]  # 빈 답변은 보내지 않습니다.


def test_cover_letter_review_without_answers_is_400(client, auth_headers, fake_ai):
    empty = {**COVER_LETTER, "items": [{"question": "문항", "answer": "  "}]}
    letter_id = client.post("/api/cover-letters", json=empty, headers=auth_headers).json()["id"]
    assert client.post(f"/api/cover-letters/{letter_id}/review", headers=auth_headers).status_code == 400
    assert fake_ai.calls == []


def test_portfolio_assist(client, auth_headers, fake_ai):
    project_id = client.post("/api/portfolios", json=PORTFOLIO, headers=auth_headers).json()["id"]
    res = client.post(f"/api/portfolios/{project_id}/assist", headers=auth_headers)
    assert res.status_code == 200, res.text
    assist = res.json()["assist"]
    assert assist["expectedQuestions"][0]["question"] == "왜 Redis 를 썼나요?"
    assert assist["resumeBullets"] and assist["polishedDescription"]
    assert "githubUrl" not in fake_ai.calls[0]


def test_portfolio_assist_needs_content(client, auth_headers, fake_ai):
    body = {"title": "빈 프로젝트"}
    project_id = client.post("/api/portfolios", json=body, headers=auth_headers).json()["id"]
    assert client.post(f"/api/portfolios/{project_id}/assist", headers=auth_headers).status_code == 400


def test_ai_routes_require_login(client):
    assert client.post("/api/resumes/1/review").status_code == 401
    assert client.post("/api/cover-letters/1/review").status_code == 401
    assert client.post("/api/portfolios/1/assist").status_code == 401
