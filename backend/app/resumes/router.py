from fastapi import APIRouter, Response, status

from app.ai.providers import ChatModelDep
from app.core.config import SettingsDep
from app.core.db import DbSession
from app.core.security import CurrentUser
from app.resumes import service
from app.resumes.schemas import ResumeRequest, ResumeResponse, ResumeSummary

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


@router.get("")
def list_resumes(db: DbSession, user: CurrentUser) -> list[ResumeSummary]:
    return service.list_(db, user)


@router.post("", status_code=status.HTTP_201_CREATED)
def create(request: ResumeRequest, db: DbSession, user: CurrentUser) -> ResumeResponse:
    return service.create(db, user, request)


@router.get("/{resume_id}")
def get_resume(resume_id: int, db: DbSession, user: CurrentUser) -> ResumeResponse:
    return service.get(db, user, resume_id)


@router.put("/{resume_id}")
def update(resume_id: int, request: ResumeRequest, db: DbSession, user: CurrentUser) -> ResumeResponse:
    return service.update(db, user, resume_id, request)


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(resume_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.delete(db, user, resume_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{resume_id}/review")
def review(
    resume_id: int, db: DbSession, user: CurrentUser, model: ChatModelDep, settings: SettingsDep
) -> ResumeResponse:
    """지원 직무 기준 AI 첨삭. 결과를 이력서에 저장하고 돌려줍니다. 10~30초 걸릴 수 있습니다."""
    return service.review(db, user, resume_id, model, settings)
