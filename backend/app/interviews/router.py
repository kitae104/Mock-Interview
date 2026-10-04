from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.ai.providers import ChatModelDep
from app.core.config import SettingsDep
from app.core.db import DbSession
from app.core.security import CurrentUser
from app.interviews import service
from app.interviews.models import InterviewStatus
from app.interviews.schemas import (
    InterviewConfig,
    InterviewCreateRequest,
    InterviewDetail,
    InterviewListResponse,
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


@router.get("/{interview_id}")
def get_interview(interview_id: int, db: DbSession, user: CurrentUser) -> InterviewDetail:
    return service.get(db, user, interview_id)


@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview(interview_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.delete(db, user, interview_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
