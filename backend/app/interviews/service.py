import logging
import re
from datetime import timedelta

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.ai.providers import ChatModel, ModelError
from app.ai.speech import DEFAULT_PROMPT, SpeechToText
from app.ai.structured import complete_json
from app.common.errors import ApiError, field_message
from app.core.config import Settings
from app.core.db import utcnow
from app.interviews import feedback as feedback_service
from app.interviews import prompts
from app.interviews.audio import AUDIO_FORMATS, SUPPORTED_FORMATS_TEXT, detect_audio_format, upload_filename
from app.interviews.judgement import judge_nonverbal, reference_for
from app.interviews.models import (
    Interview,
    InterviewAnswer,
    InterviewLevel,
    InterviewQuestion,
    InterviewStatus,
    QuestionCategory,
)
from app.interviews.nonverbal import NonverbalMetrics
from app.interviews.prompts import GeneratedQuestionSet
from app.interviews.ratelimit import enforce_ai_rate
from app.interviews.redact import redact_text
from app.interviews.schemas import (
    AnswerResponse,
    InterviewConfig,
    InterviewCreateRequest,
    InterviewDetail,
    InterviewListResponse,
    InterviewStartRequest,
    InterviewStats,
    InterviewSummary,
    NonverbalResult,
    QuestionResponse,
    RecentScore,
    SpeechMetrics,
    SpeechResult,
    Verdict,
)
from app.interviews.speech_metrics import compute_speech_metrics, judge_speech
from app.interviews.thresholds import TIMEOUT_TOLERANCE_SECONDS, planned_categories
from app.users.models import User

log = logging.getLogger(__name__)

NOT_FOUND = "면접을 찾을 수 없습니다."
VALIDATION_FAILED = "입력값을 확인해 주세요."
GENERATION_FAILED = "질문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
DAILY_LIMIT_MESSAGE = "오늘 만들 수 있는 면접 수를 초과했습니다."
QUESTION_NOT_FOUND = "질문을 찾을 수 없습니다."
NOT_STARTED = "면접이 아직 시작되지 않았습니다. 장치 점검 화면에서 시작해 주세요."
CONSENT_REQUIRED = "안내 내용에 동의해야 면접을 시작할 수 있습니다."
CONSENT_VERSION_CHANGED = "안내 문구가 바뀌었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요."
INTERVIEW_COMPLETED = "이미 종료된 면접입니다."
SPEECH_FAILED = "음성을 텍스트로 바꾸지 못했습니다. 다시 시도해 주세요."
FEEDBACK_FAILED = "AI 피드백을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
#: 한 답변에서 저장하는 단어 수의 상한 (2분 답변은 보통 400단어 안팎)
MAX_STORED_WORDS = 2000
MAX_NONVERBAL_JSON_BYTES = 20_000

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


def stats(db: Session, user: User) -> InterviewStats:
    """끝난 면접의 개수·평균 점수·최근 10개 점수 (점수가 아직 없는 면접은 제외)."""
    scored = (
        Interview.user_id == user.id,
        Interview.status == InterviewStatus.COMPLETED,
        Interview.overall_score.is_not(None),
    )
    count, average = db.execute(select(func.count(), func.avg(Interview.overall_score)).where(*scored)).one()
    rows = db.scalars(
        select(Interview).where(*scored).order_by(Interview.completed_at.desc(), Interview.id.desc()).limit(10)
    ).all()
    recent = [
        RecentScore(id=i.id, title=i.title, score=i.overall_score or 0, completed_at=i.completed_at or i.created_at)
        for i in reversed(rows)
    ]
    return InterviewStats(
        completed_count=int(count or 0),
        # 평균은 반올림합니다 (70.5 → 71)
        average_score=None if average is None else int(float(average) + 0.5),
        recent=recent,
    )


def retry(db: Session, user: User, interview_id: int, settings: Settings) -> InterviewDetail:
    """같은 질문으로 다시 하기: 질문을 그대로 복사한 새 면접(READY)을 만듭니다.
    AI 를 부르지 않고 답변·점수는 복사하지 않습니다.

    하루 생성 한도에는 포함됩니다. 어떤 상태의 면접이든 복사할 수 있습니다.
    """
    source = _find(db, user, interview_id)
    _enforce_daily_limit(db, user, settings)
    copy = Interview(
        user_id=user.id,
        title=source.title,
        field=source.field,
        level=source.level,
        question_count=source.question_count,
        job_posting=source.job_posting,
        status=InterviewStatus.READY,
        max_answer_seconds=settings.interview_max_answer_seconds,
        prep_seconds=source.prep_seconds,
        nonverbal_enabled=True,
        questions=[
            InterviewQuestion(
                seq=q.seq, category=q.category, text=q.text, intent=q.intent, expected_points=q.expected_points
            )
            for q in source.questions
        ],
    )
    db.add(copy)
    db.commit()
    return _detail(copy)


def delete(db: Session, user: User, interview_id: int) -> None:
    interview = _find(db, user, interview_id)
    db.delete(interview)
    db.commit()


def start(
    db: Session, user: User, interview_id: int, request: InterviewStartRequest, settings: Settings
) -> InterviewDetail:
    """면접을 시작합니다(READY → IN_PROGRESS). 안내에 동의해야 하고, 동의 시각·문구 버전·기준 자세를 기록합니다.

    이미 진행 중인 면접(이어하기)에 다시 부르면 상태는 그대로 두고 동의·기준 자세만 새로 기록합니다.
    끝난 면접은 다시 시작할 수 없습니다(409).
    """
    interview = _find(db, user, interview_id)
    if interview.status == InterviewStatus.COMPLETED:
        raise ApiError(409, INTERVIEW_COMPLETED)
    if not request.consent:
        raise ApiError(400, CONSENT_REQUIRED, {"consent": CONSENT_REQUIRED})
    if request.consent_version != settings.interview_consent_version:
        raise ApiError(400, CONSENT_VERSION_CHANGED, {"consentVersion": CONSENT_VERSION_CHANGED})

    now = utcnow()
    if interview.status == InterviewStatus.READY:
        interview.status = InterviewStatus.IN_PROGRESS
        interview.started_at = now
    interview.consented_at = now
    interview.consent_version = request.consent_version
    interview.nonverbal_enabled = request.nonverbal_enabled
    use_baseline = request.nonverbal_enabled and request.baseline is not None
    interview.baseline = request.baseline.model_dump(by_alias=True) if use_baseline and request.baseline else None
    db.commit()
    return _detail(interview)


def finish(db: Session, user: User, interview_id: int, model: ChatModel, settings: Settings) -> InterviewDetail:
    """면접을 끝내고(IN_PROGRESS → COMPLETED) 종합 리포트를 만듭니다. 모든 질문에 답변이 있어야 합니다.

    피드백이 없거나 실패한 답변은 여기서 다시 만들고, 답변별 피드백과 지표 평균으로 리포트를 만들어 저장합니다.
    이미 리포트가 있으면 AI 를 부르지 않고 그대로 돌려줍니다(멱등). 중간에 AI 가 실패하면 502 이고,
    면접은 이미 끝난 상태라 같은 요청을 다시 보내면 비어 있는 부분만 이어서 만듭니다.
    """
    interview = _find(db, user, interview_id)
    if interview.status == InterviewStatus.READY:
        raise ApiError(409, NOT_STARTED)
    if interview.status == InterviewStatus.IN_PROGRESS:
        missing = [q.seq for q in interview.questions if q.answer is None]
        if missing:
            numbers = ", ".join(str(n) for n in missing)
            raise ApiError(409, f"아직 답변하지 않은 질문이 {len(missing)}개 있습니다. ({numbers}번)")
        interview.status = InterviewStatus.COMPLETED
        interview.completed_at = utcnow()
        db.commit()
    _build_report(db, interview, model, settings)
    return _detail(interview)


def submit_answer(
    db: Session,
    user: User,
    interview_id: int,
    question_id: int,
    *,
    audio: bytes,
    duration_ms: int,
    nonverbal_json: str | None,
    stt: SpeechToText,
    model: ChatModel,
    settings: Settings,
) -> tuple[AnswerResponse, bool]:
    """답변 오디오를 텍스트로 바꾸고 말하기 지표를 계산해 저장한 뒤, 답변별 피드백을 만듭니다.
    같은 질문에 다시 보내면 덮어씁니다. 피드백을 만들지 못해도 답변 저장은 유지하고 피드백 상태만 FAILED 로 둡니다.

    오디오는 이 함수의 지역 변수로만 존재하고 어디에도 저장하지 않습니다.
    돌려주는 값의 둘째 항목은 새로 만들었는지(True) 덮어썼는지(False) 입니다.
    """
    interview = _find(db, user, interview_id)
    question = next((q for q in interview.questions if q.id == question_id), None)
    if question is None:
        raise ApiError(404, QUESTION_NOT_FOUND)
    if interview.status == InterviewStatus.COMPLETED:
        raise ApiError(409, INTERVIEW_COMPLETED)
    if interview.status == InterviewStatus.READY:
        raise ApiError(409, NOT_STARTED)  # 동의를 기록하고 시작한 면접만 음성을 받습니다 (docs/PLAN.md 7.6)
    audio_format = _check_audio(audio, settings)
    nonverbal = _parse_nonverbal(nonverbal_json)
    enforce_ai_rate(user.id, settings.interview_ai_rate_per_minute)

    # 이후에 쓸 값을 먼저 꺼내 둡니다. 음성 인식은 수 초~수십 초 걸리므로,
    # 그동안 DB 연결을 붙잡지 않도록 읽기 트랜잭션을 끝냅니다.
    prompt = f"{DEFAULT_PROMPT} 분야: {interview.field}"[:200]
    max_answer_seconds = interview.max_answer_seconds
    category = question.category
    db.commit()

    try:
        result = stt.transcribe(
            audio, filename=upload_filename(audio_format), content_type=AUDIO_FORMATS[audio_format], prompt=prompt
        )
    except ModelError as e:
        log.warning("음성 인식 실패: %s", e)
        raise ApiError(502, SPEECH_FAILED) from e

    client_seconds = duration_ms / 1000
    audio_seconds = result.duration if result.duration else client_seconds
    timed_out = client_seconds >= max_answer_seconds - TIMEOUT_TOLERANCE_SECONDS
    words = [{"w": w.word, "s": w.start, "e": w.end} for w in result.words[:MAX_STORED_WORDS]]
    # 지표는 인식된 원문으로 계산하고, 저장하는 텍스트에서는 전화번호 같은 개인정보 패턴을 가립니다.
    metrics = compute_speech_metrics(
        words,
        audio_seconds=audio_seconds,
        max_answer_seconds=max_answer_seconds,
        timed_out=timed_out,
        no_speech_probs=result.no_speech_probs,
    )
    if metrics["noSpeech"]:
        transcript, stored_words = "", []  # 빈 답변: 무음에서 지어낸 문장은 버립니다.
    else:
        transcript = redact_text(result.text)
        stored_words = [{**w, "w": redact_text(w["w"])} for w in words]

    answer = db.scalar(select(InterviewAnswer).where(InterviewAnswer.question_id == question_id))
    created = answer is None
    if answer is None:
        answer = InterviewAnswer(question_id=question_id, interview_id=interview_id)
        db.add(answer)
    answer.transcript = transcript
    answer.words = stored_words
    answer.language = result.language
    answer.audio_seconds = round(audio_seconds, 2)
    answer.client_seconds = round(client_seconds, 2)
    answer.timed_out = timed_out
    answer.speech_metrics = metrics
    answer.nonverbal_metrics = nonverbal.model_dump(by_alias=True) if nonverbal else None
    # 답변이 바뀌었으므로 이전 피드백과 점수는 더 이상 맞지 않습니다.
    answer.feedback = None
    answer.feedback_status = "NONE"
    answer.score = None
    answer.feedback_generated_at = None
    answer.created_at = utcnow()
    db.commit()
    _fill_feedback(db, interview, question, answer, model, settings)
    response = _answer(answer, category)
    assert response is not None
    return response, created


# ---- 내부 함수 ----


def _fill_feedback(
    db: Session,
    interview: Interview,
    question: InterviewQuestion,
    answer: InterviewAnswer,
    model: ChatModel,
    settings: Settings,
) -> bool:
    """답변 하나의 피드백을 만들어 저장합니다. 성공하면 True.

    실패(AI 오류, 호출 한도 초과 등)해도 예외를 올리지 않고 피드백 상태만 FAILED 로 남깁니다. 답변은 그대로입니다.
    AI 호출은 오래 걸리므로 그동안 DB 연결을 붙잡지 않도록 먼저 읽기 트랜잭션을 끝냅니다 (PLAN.md 3.2).
    """
    transcript = answer.transcript
    try:
        if not feedback_service.is_empty_answer(answer):
            enforce_ai_rate(interview.user_id, settings.interview_ai_rate_per_minute)
        db.commit()
        feedback, score = feedback_service.make_answer_feedback(model, interview, question, answer)
    except Exception as e:  # noqa: BLE001 - 어떤 실패든 답변 저장에는 영향을 주지 않습니다. 본문은 로그에 남기지 않음.
        log.warning("답변 피드백 생성 실패: %s", type(e).__name__)
        _store_feedback(db, answer, transcript, None, None)
        return False
    return _store_feedback(db, answer, transcript, feedback, score)


def _store_feedback(
    db: Session, answer: InterviewAnswer, transcript: str, feedback: dict | None, score: int | None
) -> bool:
    db.refresh(answer)  # 기다리는 사이 같은 질문의 답변이 다시 올라왔다면 그 답변에 낡은 피드백을 붙이지 않습니다.
    if answer.transcript != transcript:
        return False
    if answer.feedback is not None:
        return True  # 겹친 요청이 먼저 저장함
    if feedback is None:
        answer.feedback_status = "FAILED"
        db.commit()
        return False
    answer.feedback = feedback
    answer.score = score
    answer.feedback_status = "DONE"
    answer.feedback_generated_at = utcnow()
    db.commit()
    return True


def _build_report(db: Session, interview: Interview, model: ChatModel, settings: Settings) -> None:
    """빠진 답변 피드백을 채우고 종합 리포트를 만들어 저장합니다. 이미 리포트가 있으면 아무것도 하지 않습니다."""
    if interview.report is not None:
        return
    failed = False
    for question in interview.questions:
        answer = question.answer
        if (
            answer is not None
            and answer.feedback is None
            and not _fill_feedback(db, interview, question, answer, model, settings)
        ):
            failed = True
    if failed:
        raise ApiError(502, FEEDBACK_FAILED)

    enforce_ai_rate(interview.user_id, settings.interview_ai_rate_per_minute)
    db.commit()
    try:
        report = feedback_service.make_report(model, interview)
    except ModelError as e:
        log.warning("종합 리포트 생성 실패: %s", e)
        raise ApiError(502, FEEDBACK_FAILED) from e
    interview.report = report
    interview.overall_score = report["overallScore"]
    interview.report_generated_at = utcnow()
    db.commit()


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
    _enforce_daily_limit(db, user, settings)


def _enforce_daily_limit(db: Session, user: User, settings: Settings) -> None:
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


def _check_audio(audio: bytes, settings: Settings) -> str:
    """오디오 파일을 검사하고 형식(webm, ogg, mp4, wav)을 돌려줍니다. 형식은 파일 머리 바이트로 판별합니다."""
    if not audio:
        raise ApiError(400, "오디오 파일이 비어 있습니다.")
    if len(audio) > settings.interview_max_audio_mb * 1024 * 1024:
        raise ApiError(413, f"오디오 파일이 너무 큽니다. {settings.interview_max_audio_mb}MB 이하만 보낼 수 있습니다.")
    audio_format = detect_audio_format(audio)
    if audio_format is None:
        raise ApiError(400, f"지원하지 않는 오디오 형식입니다. {SUPPORTED_FORMATS_TEXT} 형식만 보낼 수 있습니다.")
    return audio_format


def _parse_nonverbal(raw: str | None) -> NonverbalMetrics | None:
    """폼 필드로 온 비언어 요약 지표(JSON 문자열)를 검증합니다. 없으면 None (분석을 끈 경우)."""
    if raw is None or not raw.strip():
        return None
    if len(raw.encode("utf-8")) > MAX_NONVERBAL_JSON_BYTES:
        raise ApiError(400, VALIDATION_FAILED, {"nonverbal": "비언어 지표가 너무 큽니다."})
    try:
        return NonverbalMetrics.model_validate_json(raw)
    except ValidationError as e:
        errors: dict[str, str] = {}
        for err in e.errors():
            name = ".".join(["nonverbal", *(str(part) for part in err["loc"])])
            if err["type"] == "json_invalid":
                errors["nonverbal"] = "비언어 지표가 올바른 JSON 형식이 아닙니다."
            else:
                errors.setdefault(name, field_message(dict(err)))
        raise ApiError(400, VALIDATION_FAILED, errors) from e


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
            answer=_answer(q.answer, q.category),
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


def _answer(answer: InterviewAnswer | None, category: QuestionCategory) -> AnswerResponse | None:
    if answer is None:
        return None
    speech = None
    if answer.speech_metrics:
        verdicts = {
            key: Verdict(**v, reference=reference_for(key, category))
            for key, v in judge_speech(answer.speech_metrics, category).items()
        }
        speech = SpeechResult(metrics=SpeechMetrics.model_validate(answer.speech_metrics), verdicts=verdicts)
    nonverbal = None
    if answer.nonverbal_metrics:
        metrics = NonverbalMetrics.model_validate(answer.nonverbal_metrics)
        nonverbal_verdicts = {
            key: Verdict(**v, reference=reference_for(key, category))
            for key, v in judge_nonverbal(answer.nonverbal_metrics).items()
        }
        nonverbal = NonverbalResult(metrics=metrics, verdicts=nonverbal_verdicts, reliable=metrics.is_reliable())
    return AnswerResponse(
        id=answer.id,
        question_id=answer.question_id,
        transcript=answer.transcript,
        audio_seconds=answer.audio_seconds,
        timed_out=answer.timed_out,
        speech=speech,
        nonverbal=nonverbal,
        feedback=answer.feedback,
        feedback_status="DONE" if answer.feedback is not None else (answer.feedback_status or "NONE"),  # type: ignore[arg-type]
        score=answer.score,
    )
