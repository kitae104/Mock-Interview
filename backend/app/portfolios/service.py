from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.assist import run_assist
from app.ai.providers import ChatModel
from app.common.errors import ApiError
from app.core.config import Settings
from app.core.db import utcnow
from app.portfolios import prompts
from app.portfolios.models import PortfolioProject
from app.portfolios.schemas import PortfolioAssist, PortfolioRequest, PortfolioResponse
from app.users.models import User

MAX_PER_USER = 50
NOT_FOUND = "프로젝트를 찾을 수 없습니다."
ASSIST_FAILED = "AI 다듬기 결과를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."


def _get_own(db: Session, user: User, project_id: int) -> PortfolioProject:
    project = db.get(PortfolioProject, project_id)
    if project is None or project.user_id != user.id:  # 남의 프로젝트는 존재를 숨깁니다.
        raise ApiError(404, NOT_FOUND)
    return project


def _apply(project: PortfolioProject, request: PortfolioRequest) -> None:
    project.title = request.title.strip()
    project.summary = request.summary.strip()
    project.role = request.role.strip()
    project.period = request.period.strip()
    project.team_size = request.team_size
    project.tech_stack = [t.strip() for t in request.tech_stack if t.strip()]
    project.description = request.description
    project.achievements = request.achievements
    project.github_url = request.github_url
    project.demo_url = request.demo_url
    project.featured = request.featured


def list_(db: Session, user: User) -> list[PortfolioResponse]:
    """대표 프로젝트를 먼저, 그다음 최근 수정 순."""
    projects = db.scalars(
        select(PortfolioProject)
        .where(PortfolioProject.user_id == user.id)
        .order_by(PortfolioProject.featured.desc(), PortfolioProject.updated_at.desc(), PortfolioProject.id.desc())
    )
    return [PortfolioResponse.model_validate(p) for p in projects]


def create(db: Session, user: User, request: PortfolioRequest) -> PortfolioResponse:
    count = (
        db.scalar(select(func.count()).select_from(PortfolioProject).where(PortfolioProject.user_id == user.id)) or 0
    )
    if count >= MAX_PER_USER:
        raise ApiError(400, f"프로젝트는 {MAX_PER_USER}개까지 등록할 수 있습니다. 쓰지 않는 프로젝트를 삭제해 주세요.")
    project = PortfolioProject(user_id=user.id)
    _apply(project, request)
    db.add(project)
    db.commit()
    return PortfolioResponse.model_validate(project)


def get(db: Session, user: User, project_id: int) -> PortfolioResponse:
    return PortfolioResponse.model_validate(_get_own(db, user, project_id))


def update(db: Session, user: User, project_id: int, request: PortfolioRequest) -> PortfolioResponse:
    project = _get_own(db, user, project_id)
    _apply(project, request)
    project.updated_at = utcnow()
    db.commit()
    return PortfolioResponse.model_validate(project)


def delete(db: Session, user: User, project_id: int) -> None:
    db.delete(_get_own(db, user, project_id))
    db.commit()


def assist(db: Session, user: User, project_id: int, model: ChatModel, settings: Settings) -> PortfolioResponse:
    project = _get_own(db, user, project_id)
    if not (project.description.strip() or project.achievements.strip() or project.summary.strip()):
        raise ApiError(400, "프로젝트 설명이나 성과를 먼저 작성하고 저장해 주세요.")
    payload = prompts.assist_payload(project)
    result = run_assist(
        db, user.id, model, settings, prompts.ASSIST_SYSTEM_PROMPT, payload, PortfolioAssist, ASSIST_FAILED
    )
    project = _get_own(db, user, project_id)
    project.assist = result.model_dump(by_alias=True)
    project.assisted_at = utcnow()
    db.commit()
    return PortfolioResponse.model_validate(project)
