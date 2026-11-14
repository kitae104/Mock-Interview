from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.ai.assist import Short, clip, take
from app.common.schemas import ApiModel, RequestModel
from app.common.validators import not_blank, size

Text50 = Annotated[str, Field(max_length=50)]
Text100 = Annotated[str, Field(max_length=100)]


class Experience(ApiModel):
    organization: Text100 = ""
    position: Text100 = ""
    period: Text50 = ""
    description: Annotated[str, Field(max_length=2000)] = ""


class Education(ApiModel):
    school: Text100 = ""
    major: Text100 = ""
    period: Text50 = ""
    note: Annotated[str, Field(max_length=300)] = ""


class ResumeProject(ApiModel):
    name: Text100 = ""
    period: Text50 = ""
    role: Text100 = ""
    tech_stack: Annotated[list[Text50], Field(max_length=20)] = []
    description: Annotated[str, Field(max_length=2000)] = ""


class Certificate(ApiModel):
    name: Text100 = ""
    issuer: Text100 = ""
    date: Annotated[str, Field(max_length=20)] = ""


class ResumeContent(ApiModel):
    """이력서 본문. 요청과 응답에 같은 모양을 씁니다."""

    name: Text50 = ""
    email: Annotated[str, Field(max_length=255)] = ""
    phone: Annotated[str, Field(max_length=30)] = ""
    links: Annotated[list[Annotated[str, Field(max_length=300)]], Field(max_length=5)] = []
    summary: Annotated[str, Field(max_length=1000)] = ""
    skills: Annotated[list[Text50], Field(max_length=40)] = []
    experiences: Annotated[list[Experience], Field(max_length=20)] = []
    educations: Annotated[list[Education], Field(max_length=10)] = []
    projects: Annotated[list[ResumeProject], Field(max_length=20)] = []
    certificates: Annotated[list[Certificate], Field(max_length=20)] = []


class ResumeRequest(RequestModel):
    title: Annotated[str, not_blank("제목을 입력해 주세요."), size("제목은 100자 이하여야 합니다.", max_length=100)]
    target_role: Text100 = ""
    content: ResumeContent = ResumeContent()


class ResumeImprovement(ApiModel):
    section: Annotated[str, clip(50)] = ""
    point: Short = ""
    suggestion: Annotated[str, clip(500)] = ""


class ResumeReview(ApiModel):
    """AI 첨삭 결과. LLM 출력도 이 모양으로 받아 검증합니다 (길이는 잘라 받음)."""

    score: Annotated[int, Field(ge=0, le=100)]
    overall: Annotated[str, clip(800)] = ""
    strengths: Annotated[list[Short], take(5)] = []
    improvements: Annotated[list[ResumeImprovement], take(8)] = []
    suggested_summary: Annotated[str, clip(1000)] = ""
    missing_keywords: Annotated[list[Annotated[str, clip(50)]], take(10)] = []


class ResumeSummary(ApiModel):
    id: int
    title: str
    target_role: str
    review_score: int | None = None
    created_at: datetime
    updated_at: datetime


class ResumeResponse(ApiModel):
    id: int
    title: str
    target_role: str
    content: ResumeContent
    review: ResumeReview | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
