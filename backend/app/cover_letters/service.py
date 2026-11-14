from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.assist import run_assist
from app.ai.providers import ChatModel
from app.common.errors import ApiError
from app.core.config import Settings
from app.core.db import utcnow
from app.cover_letters import prompts
from app.cover_letters.models import CoverLetter
from app.cover_letters.schemas import (
    CoverLetterRequest,
    CoverLetterResponse,
    CoverLetterReview,
    CoverLetterSummary,
    DraftRequest,
    DraftResponse,
)
from app.users.models import User

MAX_PER_USER = 50
NOT_FOUND = "자기소개서를 찾을 수 없습니다."
DRAFT_FAILED = "AI 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
REVIEW_FAILED = "AI 첨삭을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."


def _get_own(db: Session, user: User, letter_id: int) -> CoverLetter:
    letter = db.get(CoverLetter, letter_id)
    if letter is None or letter.user_id != user.id:  # 남의 자기소개서는 존재를 숨깁니다.
        raise ApiError(404, NOT_FOUND)
    return letter


def _apply(letter: CoverLetter, request: CoverLetterRequest) -> None:
    letter.title = request.title.strip()
    letter.company = request.company.strip()
    letter.target_role = request.target_role.strip()
    letter.job_posting = (request.job_posting or "").strip() or None
    letter.items = [item.model_dump(by_alias=True) for item in request.items]


def list_(db: Session, user: User) -> list[CoverLetterSummary]:
    letters = db.scalars(
        select(CoverLetter)
        .where(CoverLetter.user_id == user.id)
        .order_by(CoverLetter.updated_at.desc(), CoverLetter.id.desc())
    )
    return [
        CoverLetterSummary(
            id=c.id,
            title=c.title,
            company=c.company,
            target_role=c.target_role,
            item_count=len(c.items or []),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in letters
    ]


def create(db: Session, user: User, request: CoverLetterRequest) -> CoverLetterResponse:
    count = db.scalar(select(func.count()).select_from(CoverLetter).where(CoverLetter.user_id == user.id)) or 0
    if count >= MAX_PER_USER:
        raise ApiError(
            400, f"자기소개서는 {MAX_PER_USER}개까지 만들 수 있습니다. 쓰지 않는 자기소개서를 삭제해 주세요."
        )
    letter = CoverLetter(user_id=user.id)
    _apply(letter, request)
    db.add(letter)
    db.commit()
    return CoverLetterResponse.model_validate(letter)


def get(db: Session, user: User, letter_id: int) -> CoverLetterResponse:
    return CoverLetterResponse.model_validate(_get_own(db, user, letter_id))


def update(db: Session, user: User, letter_id: int, request: CoverLetterRequest) -> CoverLetterResponse:
    letter = _get_own(db, user, letter_id)
    _apply(letter, request)
    letter.updated_at = utcnow()
    db.commit()
    return CoverLetterResponse.model_validate(letter)


def delete(db: Session, user: User, letter_id: int) -> None:
    db.delete(_get_own(db, user, letter_id))
    db.commit()


def draft(
    db: Session, user: User, letter_id: int, request: DraftRequest, model: ChatModel, settings: Settings
) -> DraftResponse:
    """문항 하나의 초안. 저장하지 않으며 화면에서 사용자가 적용합니다."""
    letter = _get_own(db, user, letter_id)
    if request.item_index >= len(letter.items or []):
        raise ApiError(400, "문항을 찾을 수 없습니다. 자기소개서를 저장한 뒤 다시 시도해 주세요.")
    payload = prompts.draft_payload(letter, request.item_index, request.notes)
    return run_assist(db, user.id, model, settings, prompts.DRAFT_SYSTEM_PROMPT, payload, DraftResponse, DRAFT_FAILED)


def review(db: Session, user: User, letter_id: int, model: ChatModel, settings: Settings) -> CoverLetterResponse:
    payload = prompts.review_payload(_get_own(db, user, letter_id))
    if not payload["items"]:
        raise ApiError(400, "답변을 하나 이상 작성하고 저장한 뒤 첨삭을 요청해 주세요.")
    answered = {item["index"] for item in payload["items"]}

    def keep_answered(result: CoverLetterReview) -> CoverLetterReview:
        # 입력에 없는 문항 번호와 중복은 버립니다.
        seen: set[int] = set()
        items = []
        for item in result.items:
            if item.index in answered and item.index not in seen:
                seen.add(item.index)
                items.append(item)
        if not items:
            raise ValueError("items 에 입력 문항의 index 가 없습니다")
        return CoverLetterReview(overall=result.overall, items=sorted(items, key=lambda i: i.index))

    result = run_assist(
        db,
        user.id,
        model,
        settings,
        prompts.REVIEW_SYSTEM_PROMPT,
        payload,
        CoverLetterReview,
        REVIEW_FAILED,
        validate=keep_answered,
    )
    letter = _get_own(db, user, letter_id)
    letter.review = result.model_dump(by_alias=True)
    letter.reviewed_at = utcnow()
    db.commit()
    return CoverLetterResponse.model_validate(letter)
