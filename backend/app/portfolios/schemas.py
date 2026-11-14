from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, Field

from app.ai.assist import Short, clip, take
from app.common.schemas import ApiModel, RequestModel
from app.common.validators import not_blank, size


def _http_url(value: str) -> str:
    value = value.strip()
    if value and not value.lower().startswith(("http://", "https://")):
        raise ValueError("http:// 또는 https:// 로 시작하는 주소를 입력해 주세요.")
    return value


Url = Annotated[str, Field(max_length=300), AfterValidator(_http_url)]


class PortfolioRequest(RequestModel):
    title: Annotated[
        str, not_blank("프로젝트 이름을 입력해 주세요."), size("프로젝트 이름은 100자 이하여야 합니다.", max_length=100)
    ]
    summary: Annotated[str, Field(max_length=200)] = ""
    role: Annotated[str, Field(max_length=100)] = ""
    period: Annotated[str, Field(max_length=50)] = ""
    team_size: Annotated[int | None, Field(ge=1, le=100)] = None
    tech_stack: Annotated[list[Annotated[str, Field(max_length=50)]], Field(max_length=20)] = []
    description: Annotated[str, Field(max_length=5000)] = ""
    achievements: Annotated[str, Field(max_length=2000)] = ""
    github_url: Url = ""
    demo_url: Url = ""
    featured: bool = False


class ExpectedQuestion(ApiModel):
    question: Annotated[str, clip(200)]
    intent: Annotated[str, clip(300)] = ""


class PortfolioAssist(ApiModel):
    """AI 다듬기 결과 (docs/PLAN.md 12.3)."""

    polished_description: Annotated[str, clip(3000)] = ""
    resume_bullets: Annotated[list[Annotated[str, clip(150)]], take(5)] = []
    expected_questions: Annotated[list[ExpectedQuestion], take(6), Field(min_length=1)]
    tips: Annotated[list[Short], take(5)] = []


class PortfolioResponse(ApiModel):
    id: int
    title: str
    summary: str
    role: str
    period: str
    team_size: int | None
    tech_stack: list[str]
    description: str
    achievements: str
    github_url: str
    demo_url: str
    featured: bool
    assist: PortfolioAssist | None
    assisted_at: datetime | None
    created_at: datetime
    updated_at: datetime
