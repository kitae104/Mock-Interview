from fastapi import APIRouter, Response, status

from app.ai.providers import ChatModelDep
from app.core.config import SettingsDep
from app.core.db import DbSession
from app.core.security import CurrentUser
from app.cover_letters import service
from app.cover_letters.schemas import (
    CoverLetterRequest,
    CoverLetterResponse,
    CoverLetterSummary,
    DraftRequest,
    DraftResponse,
)

router = APIRouter(prefix="/api/cover-letters", tags=["cover-letters"])


@router.get("")
def list_cover_letters(db: DbSession, user: CurrentUser) -> list[CoverLetterSummary]:
    return service.list_(db, user)


@router.post("", status_code=status.HTTP_201_CREATED)
def create(request: CoverLetterRequest, db: DbSession, user: CurrentUser) -> CoverLetterResponse:
    return service.create(db, user, request)


@router.get("/{letter_id}")
def get_cover_letter(letter_id: int, db: DbSession, user: CurrentUser) -> CoverLetterResponse:
    return service.get(db, user, letter_id)


@router.put("/{letter_id}")
def update(letter_id: int, request: CoverLetterRequest, db: DbSession, user: CurrentUser) -> CoverLetterResponse:
    return service.update(db, user, letter_id, request)


@router.delete("/{letter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(letter_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.delete(db, user, letter_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{letter_id}/draft")
def draft(
    letter_id: int,
    request: DraftRequest,
    db: DbSession,
    user: CurrentUser,
    model: ChatModelDep,
    settings: SettingsDep,
) -> DraftResponse:
    """문항 하나의 AI 초안(경험 메모 기반). 저장하지 않습니다."""
    return service.draft(db, user, letter_id, request, model, settings)


@router.post("/{letter_id}/review")
def review(
    letter_id: int, db: DbSession, user: CurrentUser, model: ChatModelDep, settings: SettingsDep
) -> CoverLetterResponse:
    """답변이 있는 문항별 AI 첨삭. 결과를 저장하고 돌려줍니다."""
    return service.review(db, user, letter_id, model, settings)
