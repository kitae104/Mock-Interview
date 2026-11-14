from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.ai.assist import Short, clip, take
from app.common.schemas import ApiModel, RequestModel
from app.common.validators import not_blank, size

Text100 = Annotated[str, Field(max_length=100)]


class CoverLetterItem(ApiModel):
    """문항 하나. char_limit 은 회사가 정한 글자 수 제한(공백 포함)."""

    question: Annotated[str, not_blank("문항을 입력해 주세요."), size("문항은 500자 이하여야 합니다.", max_length=500)]
    answer: Annotated[str, Field(max_length=5000)] = ""
    char_limit: Annotated[int | None, Field(ge=100, le=5000)] = None


class CoverLetterRequest(RequestModel):
    title: Annotated[str, not_blank("제목을 입력해 주세요."), size("제목은 100자 이하여야 합니다.", max_length=100)]
    company: Text100 = ""
    target_role: Text100 = ""
    job_posting: Annotated[str | None, Field(max_length=4000)] = None
    items: Annotated[list[CoverLetterItem], Field(min_length=1, max_length=10)]


class DraftRequest(RequestModel):
    item_index: Annotated[int, Field(ge=0)]
    notes: Annotated[
        str,
        not_blank("초안에 쓸 경험을 간단히 적어 주세요."),
        size("경험 메모는 2000자 이하여야 합니다.", max_length=2000),
    ]


class DraftResponse(ApiModel):
    draft: Annotated[str, clip(5000)]


class ItemReview(ApiModel):
    index: Annotated[int, Field(ge=0)]
    score: Annotated[int, Field(ge=0, le=100)]
    comment: Annotated[str, clip(600)] = ""
    suggestions: Annotated[list[Short], take(5)] = []
    revised: Annotated[str, clip(5000)] = ""


class CoverLetterReview(ApiModel):
    overall: Annotated[str, clip(800)] = ""
    items: list[ItemReview] = []


class CoverLetterSummary(ApiModel):
    id: int
    title: str
    company: str
    target_role: str
    item_count: int
    created_at: datetime
    updated_at: datetime


class CoverLetterResponse(ApiModel):
    id: int
    title: str
    company: str
    target_role: str
    job_posting: str | None
    items: list[CoverLetterItem]
    review: CoverLetterReview | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
