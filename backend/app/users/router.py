from fastapi import APIRouter

from app.core.security import CurrentUser
from app.users.schemas import UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me")
def me(user: CurrentUser) -> UserResponse:
    """로그인한 사용자 정보. 엔티티(User)를 그대로 반환하지 않고 UserResponse 로 바꿉니다."""
    return UserResponse.model_validate(user)
