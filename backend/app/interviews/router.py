from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status

from app.ai.providers import ChatModelDep
from app.ai.speech import SpeechToTextDep
from app.core.config import SettingsDep
from app.core.db import DbSession
from app.core.security import CurrentUser
from app.interviews import service
from app.interviews.models import InterviewStatus
from app.interviews.schemas import (
    AnswerResponse,
    InterviewConfig,
    InterviewCreateRequest,
    InterviewDetail,
    InterviewListResponse,
    InterviewStartRequest,
    InterviewStats,
)

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


# 고정 경로(/config)는 /{interview_id} 보다 먼저 선언합니다.
@router.get("/config")
def get_config(user: CurrentUser, settings: SettingsDep) -> InterviewConfig:
    """화면이 입력 범위(질문 수, 생각할 시간, 공고 글자 수)를 서버 설정과 맞추려고 읽습니다."""
    return service.get_config(settings)


@router.post("", status_code=status.HTTP_201_CREATED)
def create(
    request: InterviewCreateRequest, db: DbSession, user: CurrentUser, model: ChatModelDep, settings: SettingsDep
) -> InterviewDetail:
    """분야·수준·질문 수(·채용 공고)로 AI 가 질문 세트를 만들어 면접(READY)을 생성합니다. 10~30초 걸릴 수 있습니다."""
    return service.create(db, user, request, model, settings)


@router.get("")
def list_interviews(
    db: DbSession,
    user: CurrentUser,
    status: InterviewStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> InterviewListResponse:
    return service.list_(db, user, status, limit, offset)


@router.get("/stats")
def get_stats(db: DbSession, user: CurrentUser) -> InterviewStats:
    """대시보드용: 끝난 면접 수, 평균 점수, 최근 10개 점수 추이."""
    return service.stats(db, user)


@router.get("/{interview_id}")
def get_interview(interview_id: int, db: DbSession, user: CurrentUser) -> InterviewDetail:
    return service.get(db, user, interview_id)


@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview(interview_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.delete(db, user, interview_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{interview_id}/questions/{question_id}/answer", status_code=status.HTTP_201_CREATED)
def submit_answer(
    interview_id: int,
    question_id: int,
    response: Response,
    db: DbSession,
    user: CurrentUser,
    stt: SpeechToTextDep,
    model: ChatModelDep,
    settings: SettingsDep,
    audio: Annotated[UploadFile, File(description="답변 녹음 (webm, ogg, mp4, m4a, wav)")],
    duration_ms: Annotated[
        int, Form(alias="durationMs", ge=0, le=3_600_000, description="브라우저가 잰 녹음 시간(ms)")
    ],
    nonverbal: Annotated[str | None, Form(description="비언어 요약 지표 JSON 문자열 (선택)")] = None,
) -> AnswerResponse:
    """답변 오디오를 텍스트로 바꾸고 말하기 지표를 계산해 저장한 뒤 답변별 AI 피드백을 만듭니다.
    오디오는 저장하지 않습니다.
    피드백 생성이 실패해도 답변은 저장되고 feedbackStatus 만 FAILED 입니다.
    같은 질문에 다시 보내면 덮어씁니다(첫 저장 201, 덮어쓰기 200)."""
    # 상한보다 1바이트 더 읽어서, 상한을 넘으면 서비스가 413 으로 거절합니다 (파일 전체를 메모리에 올리지 않음).
    content = audio.file.read(settings.interview_max_audio_mb * 1024 * 1024 + 1)
    answer, created = service.submit_answer(
        db,
        user,
        interview_id,
        question_id,
        audio=content,
        duration_ms=duration_ms,
        nonverbal_json=nonverbal,
        stt=stt,
        model=model,
        settings=settings,
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return answer


@router.post("/{interview_id}/start")
def start_interview(
    interview_id: int, request: InterviewStartRequest, db: DbSession, user: CurrentUser, settings: SettingsDep
) -> InterviewDetail:
    """안내 동의를 기록하고 면접을 시작합니다(IN_PROGRESS). 끝난 면접은 409. 진행 중이면 기준 자세만 새로 기록합니다."""
    return service.start(db, user, interview_id, request, settings)


@router.post("/{interview_id}/finish")
def finish_interview(
    interview_id: int, db: DbSession, user: CurrentUser, model: ChatModelDep, settings: SettingsDep
) -> InterviewDetail:
    """모든 질문에 답변이 있으면 면접을 끝내고(COMPLETED) 종합 리포트를 만듭니다. 수십 초 걸릴 수 있습니다.
    빠진 답변 피드백은 다시 만들고, 이미 리포트가 있으면 AI 를 부르지 않고 그대로 돌려줍니다.
    AI 가 실패하면 502 이고, 같은 요청을 다시 보내면 이어서 만듭니다."""
    return service.finish(db, user, interview_id, model, settings)


@router.post("/{interview_id}/retry", status_code=status.HTTP_201_CREATED)
def retry_interview(interview_id: int, db: DbSession, user: CurrentUser, settings: SettingsDep) -> InterviewDetail:
    """같은 질문으로 다시 하기: 질문을 복사한 새 면접(READY)을 만듭니다. AI 를 부르지 않습니다."""
    return service.retry(db, user, interview_id, settings)
