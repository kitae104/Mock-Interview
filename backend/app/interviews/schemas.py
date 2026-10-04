from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field

from app.common.schemas import ApiModel, RequestModel
from app.common.validators import not_blank, size
from app.interviews.models import InterviewLevel, InterviewStatus, QuestionCategory
from app.interviews.nonverbal import BaselineModel, NonverbalMetrics


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


class InterviewStartRequest(RequestModel):
    """면접 시작(점검 화면의 [준비 완료]). 안내에 동의해야 시작할 수 있고, 동의 시각과 문구 버전을 서버에 기록합니다."""

    consent: bool
    consent_version: Annotated[
        str, not_blank("안내 문구 버전이 필요합니다."), size("안내 문구 버전이 올바르지 않습니다.", max_length=20)
    ]
    #: 표정·자세 분석을 쓰는지. false 면 기준 자세는 저장하지 않습니다.
    nonverbal_enabled: bool = True
    baseline: BaselineModel | None = None


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


class Verdict(ApiModel):
    """판정 한 항목. level 은 화면의 색(좋음/보통/주의/측정 불가), label 은 보여 줄 문구."""

    level: Literal["GOOD", "FAIR", "POOR", "NA"]
    label: str
    #: 적정 구간(기준 범위) 문구. 예: "250~330", "90% 이상". 표에서 값 옆에 보여 줍니다.
    reference: str | None = None


class SpeechMetrics(ApiModel):
    """말하기 지표 (docs/PLAN.md 4.1). 계산할 수 없는 값은 null."""

    answer_seconds: float
    max_answer_seconds: int
    timed_out: bool
    word_count: int
    syllable_count: int
    first_speech_seconds: float | None
    speech_span_seconds: float | None
    syllables_per_minute: float | None
    silence_count: int
    silence_total_seconds: float
    longest_silence_seconds: float
    filler_count: int
    filler_per_minute: float | None
    filler_breakdown: dict[str, int]
    #: 사실상 말을 하지 않은 답변 (인식된 말이 없거나 거의 없음)
    no_speech: bool


class SpeechResult(ApiModel):
    metrics: SpeechMetrics
    verdicts: dict[str, Verdict]


class NonverbalResult(ApiModel):
    """브라우저가 보낸 비언어 요약 지표와 판정 (카메라 영상으로 추정한 참고값)."""

    metrics: NonverbalMetrics
    verdicts: dict[str, Verdict]
    #: 얼굴이 충분히 보였고 충분히 분석했을 때만 true. false 면 점수에서 제외합니다.
    reliable: bool


class AnswerResponse(ApiModel):
    """답변. 피드백은 답변을 올린 직후 만들고, 실패하면 feedbackStatus 가 FAILED 로 남아 마무리할 때 다시 만듭니다."""

    id: int
    question_id: int
    #: 인식된 텍스트. 말이 없으면 빈 문자열입니다.
    transcript: str
    audio_seconds: float
    timed_out: bool
    speech: SpeechResult | None
    nonverbal: NonverbalResult | None
    feedback: dict[str, Any] | None
    feedback_status: Literal["NONE", "DONE", "FAILED"]
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


class RecentScore(ApiModel):
    id: int
    title: str
    score: int
    completed_at: datetime


class InterviewStats(ApiModel):
    """대시보드용 통계: 끝난 면접 수, 평균 점수, 최근 점수 추이."""

    completed_count: int
    average_score: int | None
    #: 최근에 끝난 면접 10개의 점수. 오래된 것부터 (막대 추이를 왼쪽에서 오른쪽으로 그리기 좋게)
    recent: list[RecentScore]
