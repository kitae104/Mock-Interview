from sqlalchemy.orm import Session

from app.auth.schemas import LoginRequest, SignupRequest, TokenResponse
from app.common.errors import ApiError
from app.core.config import Settings
from app.core.security import create_access_token, hash_password, verify_password
from app.users.models import Role, User
from app.users.schemas import UserResponse
from app.users.service import exists_by_email, find_by_email

BAD_CREDENTIALS_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다."


def normalize_email(value: str) -> str:
    return value.strip().lower()


def signup(db: Session, request: SignupRequest) -> UserResponse:
    email = normalize_email(request.email)
    password_hash = hash_password(request.password)  # 72바이트 초과면 400
    if exists_by_email(db, email):
        raise ApiError(409, "이미 가입된 이메일입니다.")
    user = User(email=email, password=password_hash, name=request.name.strip(), role=Role.USER)
    db.add(user)
    db.commit()  # 동시에 같은 이메일로 가입하면 여기서 IntegrityError → 409
    db.refresh(user)
    return UserResponse.model_validate(user)


def login(db: Session, request: LoginRequest, settings: Settings) -> TokenResponse:
    user = find_by_email(db, normalize_email(request.email))
    if user is None or not verify_password(request.password, user.password):
        raise ApiError(401, BAD_CREDENTIALS_MESSAGE)
    return TokenResponse(
        access_token=create_access_token(user.email, user.role.value, settings),
        expires_in=settings.jwt_access_token_validity_seconds,
        user=UserResponse.model_validate(user),
    )
