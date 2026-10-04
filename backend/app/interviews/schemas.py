from datetime import datetime
from typing import Annotated, Any

from pydantic import Field

from app.common.schemas import ApiModel, RequestModel
from app.common.validators import not_blank, size
from app.interviews.models import InterviewLevel, InterviewStatus, QuestionCategory


class InterviewCreateRequest(RequestModel):
    """면접 생성. 질문 수·생각할 시간·공고 길이처럼 설정(Settings)에 따라 달라지는 범위는 서비스에서 검증합니다."""

    field: Annotated[
        str, not_blank("분야를 입력해 주세요."), size("분야는 2~100자여야 합니다.", min_length=2, max_length=100)
    ]
    level: InterviewLevel
    question_count: int
    prep_seconds: int | None = None
    # 비정상적으로 큰 본문은 여기서 막고, 설정된 글자 수 제한은 서비스에서 확인합니다.
    job_posting: Annotated[str | None, Field(max_length=20000)] = None


class InterviewConfig(ApiModel):
    min_questions: int
    max_questions: int
    default_questions: int
    max_answer_seconds: int
    max_job_posting_chars: int
    max_audio_mb: int
    prep_seconds_options: list[int]
    default_prep_seconds: int
    consent_version: str


class AnswerResponse(ApiModel):
    """답변. 말하기·비언어 지표와 판정은 4단계(음성 인식), 피드백은 6단계에서 채워집니다 (docs/PLAN.md 8장)."""

    id: int
    question_id: int
    transcript: str
    audio_seconds: float
    timed_out: bool
    feedback: dict[str, Any] | None
    score: int | None


class QuestionResponse(ApiModel):
    id: int
    seq: int
    category: QuestionCategory
    text: str
    # 면접 진행 중(IN_PROGRESS)에는 null: 답변 도중 힌트가 되지 않게 숨깁니다.
    intent: str | None
    expected_points: list[str] | None
    answer: AnswerResponse | None


class InterviewSummary(ApiModel):
    id: int
    title: str
    field: str
    level: InterviewLevel
    question_count: int
    answered_count: int
    status: InterviewStatus
    overall_score: int | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class InterviewDetail(InterviewSummary):
    job_posting: str | None
    max_answer_seconds: int
    prep_seconds: int
    nonverbal_enabled: bool
    questions: list[QuestionResponse]
    report: dict[str, Any] | None


class InterviewListResponse(ApiModel):
    items: list[InterviewSummary]
    total: int
