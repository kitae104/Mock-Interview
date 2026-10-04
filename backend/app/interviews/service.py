import logging
import re
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.ai.providers import ChatModel, ModelError
from app.ai.structured import complete_json
from app.common.errors import ApiError
from app.core.config import Settings
from app.core.db import utcnow
from app.interviews import prompts
from app.interviews.models import (
    Interview,
    InterviewAnswer,
    InterviewLevel,
    InterviewQuestion,
    InterviewStatus,
)
from app.interviews.prompts import GeneratedQuestionSet
from app.interviews.ratelimit import enforce_ai_rate
from app.interviews.schemas import (
    AnswerResponse,
    InterviewConfig,
    InterviewCreateRequest,
    InterviewDetail,
    InterviewListResponse,
    InterviewSummary,
    QuestionResponse,
)
from app.interviews.thresholds import planned_categories
from app.users.models import User

log = logging.getLogger(__name__)

NOT_FOUND = "면접을 찾을 수 없습니다."
VALIDATION_FAILED = "입력값을 확인해 주세요."
GENERATION_FAILED = "질문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
DAILY_LIMIT_MESSAGE = "오늘 만들 수 있는 면접 수를 초과했습니다."

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_POSTING_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_LEVEL_TITLE = {InterviewLevel.NEWCOMER: "신입", InterviewLevel.EXPERIENCED: "경력"}


def get_config(settings: Settings) -> InterviewConfig:
    return InterviewConfig(
        min_questions=settings.interview_min_questions,
        max_questions=settings.interview_max_questions,
        default_questions=settings.interview_default_questions,
        max_answer_seconds=settings.interview_max_answer_seconds,
        max_job_posting_chars=settings.interview_job_posting_max_chars,
        max_audio_mb=settings.interview_max_audio_mb,
        prep_seconds_options=settings.interview_prep_options,
        default_prep_seconds=settings.interview_default_prep_seconds,
        consent_version=settings.interview_consent_version,
    )


def create(
    db: Session, user: User, request: InterviewCreateRequest, model: ChatModel, settings: Settings
) -> InterviewDetail:
    field, prep_seconds, job_posting = _validate(request, settings)
    _enforce_limits(db, user, settings)

    categories = planned_categories(request.question_count)
    payload = prompts.question_payload(field, request.level, request.question_count, categories, job_posting)
    # 질문 생성은 수십 초 걸릴 수 있으므로, 그동안 DB 연결을 붙잡지 않도록 읽기 트랜잭션을 끝냅니다 (PLAN.md 3.2).
    db.commit()
    questions = _generate_questions(model, payload, request.question_count)

    interview = Interview(
        user_id=user.id,
        title=f"{field} {_LEVEL_TITLE[request.level]} 모의 면접"[:120],
        field=field,
        level=request.level,
        question_count=request.question_count,
        job_posting=job_posting,
        status=InterviewStatus.READY,
        max_answer_seconds=settings.interview_max_answer_seconds,
        prep_seconds=prep_seconds,
        nonverbal_enabled=True,
        questions=[
            InterviewQuestion(
                seq=i, category=q.category, text=q.text, intent=q.intent, expected_points=q.expected_points
            )
            for i, q in enumerate(questions, start=1)
        ],
    )
    db.add(interview)
    db.commit()
    return _detail(interview)


def list_(db: Session, user: User, status: InterviewStatus | None, limit: int, offset: int) -> InterviewListResponse:
    conditions = [Interview.user_id == user.id]
    if status is not None:
        conditions.append(Interview.status == status)
    total = db.scalar(select(func.count()).select_from(Interview).where(*conditions)) or 0
    answered = (
        select(func.count(InterviewAnswer.id))
        .where(InterviewAnswer.interview_id == Interview.id)
        .correlate(Interview)
        .scalar_subquery()
    )
    rows = db.execute(
        select(Interview, answered)
        .where(*conditions)
        .order_by(Interview.created_at.desc(), Interview.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return InterviewListResponse(items=[_summary(i, int(count)) for i, count in rows], total=total)


def get(db: Session, user: User, interview_id: int) -> InterviewDetail:
    return _detail(_find(db, user, interview_id))


def delete(db: Session, user: User, interview_id: int) -> None:
    interview = _find(db, user, interview_id)
    db.delete(interview)
    db.commit()


# ---- 내부 함수 ----


def _find(db: Session, user: User, interview_id: int) -> Interview:
    """본인의 면접만 찾습니다. 남의 면접은 존재를 숨기려고 없는 것과 같은 404."""
    interview = db.scalar(
        select(Interview)
        .where(Interview.id == interview_id, Interview.user_id == user.id)
        .options(selectinload(Interview.questions).selectinload(InterviewQuestion.answer))
    )
    if interview is None:
        raise ApiError(404, NOT_FOUND)
    return interview


def _validate(request: InterviewCreateRequest, settings: Settings) -> tuple[str, int, str | None]:
    errors: dict[str, str] = {}

    field = " ".join(_CONTROL_CHARS.sub(" ", request.field).split())
    if len(field) < 2:
        errors["field"] = "분야는 2~100자여야 합니다."

    low, high = settings.interview_min_questions, settings.interview_max_questions
    if not low <= request.question_count <= high:
        errors["questionCount"] = f"질문 수는 {low}~{high}개여야 합니다."

    prep_seconds = settings.interview_default_prep_seconds if request.prep_seconds is None else request.prep_seconds
    options = settings.interview_prep_options
    if prep_seconds not in options:
        errors["prepSeconds"] = "생각할 시간은 " + ", ".join(str(o) for o in options) + "초 중에서 선택해 주세요."

    job_posting = _POSTING_CONTROL_CHARS.sub("", request.job_posting or "").strip() or None
    limit = settings.interview_job_posting_max_chars
    if job_posting is not None and len(job_posting) > limit:
        errors["jobPosting"] = f"채용 공고는 {limit}자 이하여야 합니다."

    if errors:
        raise ApiError(400, VALIDATION_FAILED, errors)
    return field, prep_seconds, job_posting


def _enforce_limits(db: Session, user: User, settings: Settings) -> None:
    enforce_ai_rate(user.id, settings.interview_ai_rate_per_minute)
    since = utcnow() - timedelta(hours=24)
    created = db.scalar(
        select(func.count()).select_from(Interview).where(Interview.user_id == user.id, Interview.created_at >= since)
    )
    if (created or 0) >= settings.interview_daily_limit:
        raise ApiError(429, DAILY_LIMIT_MESSAGE)


def _generate_questions(model: ChatModel, payload: dict, count: int):
    def check(result: GeneratedQuestionSet) -> GeneratedQuestionSet:
        seen: set[str] = set()
        unique = []
        for q in result.questions:
            key = re.sub(r"\s+", "", q.text)
            if key not in seen:
                seen.add(key)
                unique.append(q)
        if len(unique) < count:
            raise ValueError(f"질문이 {count}개여야 합니다 (중복을 뺀 현재 {len(unique)}개)")
        return GeneratedQuestionSet(questions=unique[:count])

    try:
        return complete_json(
            model, prompts.QUESTION_SYSTEM_PROMPT, payload, GeneratedQuestionSet, validate=check
        ).questions
    except ModelError as e:
        log.warning("면접 질문 생성 실패: %s", e)
        raise ApiError(502, GENERATION_FAILED) from e


def _summary(interview: Interview, answered_count: int) -> InterviewSummary:
    return InterviewSummary(
        id=interview.id,
        title=interview.title,
        field=interview.field,
        level=interview.level,
        question_count=interview.question_count,
        answered_count=answered_count,
        status=interview.status,
        overall_score=interview.overall_score,
        created_at=interview.created_at,
        started_at=interview.started_at,
        completed_at=interview.completed_at,
    )


def _detail(interview: Interview) -> InterviewDetail:
    # 평가 의도는 시작 전(READY)과 끝난 뒤(COMPLETED)에 보여 주고, 진행 중에는 숨깁니다 (답변 도중 힌트가 되지 않게).
    reveal = interview.status != InterviewStatus.IN_PROGRESS
    questions = [
        QuestionResponse(
            id=q.id,
            seq=q.seq,
            category=q.category,
            text=q.text,
            intent=q.intent if reveal else None,
            expected_points=q.expected_points if reveal else None,
            answer=_answer(q.answer),
        )
        for q in interview.questions
    ]
    answered = sum(1 for q in questions if q.answer is not None)
    return InterviewDetail(
        **_summary(interview, answered).model_dump(),
        job_posting=interview.job_posting,
        max_answer_seconds=interview.max_answer_seconds,
        prep_seconds=interview.prep_seconds,
        nonverbal_enabled=interview.nonverbal_enabled,
        questions=questions,
        report=interview.report,
    )


def _answer(answer: InterviewAnswer | None) -> AnswerResponse | None:
    if answer is None:
        return None
    return AnswerResponse(
        id=answer.id,
        question_id=answer.question_id,
        transcript=answer.transcript,
        audio_seconds=answer.audio_seconds,
        timed_out=answer.timed_out,
        feedback=answer.feedback,
        score=answer.score,
    )
