from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.assist import run_assist
from app.ai.providers import ChatModel
from app.common.errors import ApiError
from app.core.config import Settings
from app.core.db import utcnow
from app.resumes import prompts
from app.resumes.models import Resume
from app.resumes.schemas import ResumeRequest, ResumeResponse, ResumeReview, ResumeSummary
from app.users.models import User

MAX_PER_USER = 50
NOT_FOUND = "이력서를 찾을 수 없습니다."
REVIEW_FAILED = "AI 첨삭을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."


def _get_own(db: Session, user: User, resume_id: int) -> Resume:
    resume = db.get(Resume, resume_id)
    if resume is None or resume.user_id != user.id:  # 남의 이력서는 존재를 숨깁니다.
        raise ApiError(404, NOT_FOUND)
    return resume


def list_(db: Session, user: User) -> list[ResumeSummary]:
    resumes = db.scalars(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc(), Resume.id.desc())
    )
    return [
        ResumeSummary(
            id=r.id,
            title=r.title,
            target_role=r.target_role,
            review_score=(r.review or {}).get("score"),
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in resumes
    ]


def create(db: Session, user: User, request: ResumeRequest) -> ResumeResponse:
    count = db.scalar(select(func.count()).select_from(Resume).where(Resume.user_id == user.id)) or 0
    if count >= MAX_PER_USER:
        raise ApiError(400, f"이력서는 {MAX_PER_USER}개까지 만들 수 있습니다. 쓰지 않는 이력서를 삭제해 주세요.")
    resume = Resume(
        user_id=user.id,
        title=request.title.strip(),
        target_role=request.target_role.strip(),
        content=request.content.model_dump(by_alias=True),
    )
    db.add(resume)
    db.commit()
    return ResumeResponse.model_validate(resume)


def get(db: Session, user: User, resume_id: int) -> ResumeResponse:
    return ResumeResponse.model_validate(_get_own(db, user, resume_id))


def update(db: Session, user: User, resume_id: int, request: ResumeRequest) -> ResumeResponse:
    resume = _get_own(db, user, resume_id)
    resume.title = request.title.strip()
    resume.target_role = request.target_role.strip()
    resume.content = request.content.model_dump(by_alias=True)
    resume.updated_at = utcnow()
    db.commit()
    return ResumeResponse.model_validate(resume)


def delete(db: Session, user: User, resume_id: int) -> None:
    db.delete(_get_own(db, user, resume_id))
    db.commit()


def review(db: Session, user: User, resume_id: int, model: ChatModel, settings: Settings) -> ResumeResponse:
    """저장된 내용을 기준으로 첨삭합니다. 화면은 먼저 저장한 뒤 부릅니다."""
    payload = prompts.review_payload(_get_own(db, user, resume_id))
    result = run_assist(
        db, user.id, model, settings, prompts.REVIEW_SYSTEM_PROMPT, payload, ResumeReview, REVIEW_FAILED
    )
    resume = _get_own(db, user, resume_id)  # 모델을 부르는 동안 삭제됐을 수 있습니다.
    resume.review = result.model_dump(by_alias=True)
    resume.reviewed_at = utcnow()
    db.commit()
    return ResumeResponse.model_validate(resume)
