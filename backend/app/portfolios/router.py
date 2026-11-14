from fastapi import APIRouter, Response, status

from app.ai.providers import ChatModelDep
from app.core.config import SettingsDep
from app.core.db import DbSession
from app.core.security import CurrentUser
from app.portfolios import service
from app.portfolios.schemas import PortfolioRequest, PortfolioResponse

router = APIRouter(prefix="/api/portfolios", tags=["portfolios"])


@router.get("")
def list_portfolios(db: DbSession, user: CurrentUser) -> list[PortfolioResponse]:
    return service.list_(db, user)


@router.post("", status_code=status.HTTP_201_CREATED)
def create(request: PortfolioRequest, db: DbSession, user: CurrentUser) -> PortfolioResponse:
    return service.create(db, user, request)


@router.get("/{project_id}")
def get_portfolio(project_id: int, db: DbSession, user: CurrentUser) -> PortfolioResponse:
    return service.get(db, user, project_id)


@router.put("/{project_id}")
def update(project_id: int, request: PortfolioRequest, db: DbSession, user: CurrentUser) -> PortfolioResponse:
    return service.update(db, user, project_id, request)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(project_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.delete(db, user, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/assist")
def assist(
    project_id: int, db: DbSession, user: CurrentUser, model: ChatModelDep, settings: SettingsDep
) -> PortfolioResponse:
    """설명 다듬기·이력서 한 줄 성과·예상 면접 질문. 결과를 저장하고 돌려줍니다."""
    return service.assist(db, user, project_id, model, settings)
