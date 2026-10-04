from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.common.errors import ApiError
from app.core.config import Settings, SettingsDep
from app.core.db import DbSession
from app.users.models import User
from app.users.service import find_by_email

ALGORITHM = "HS256"
# BCrypt 는 72바이트까지만 처리합니다 (한글은 글자당 3바이트).
MAX_PASSWORD_BYTES = 72
PASSWORD_TOO_LONG_MESSAGE = "비밀번호가 너무 깁니다. 영문 72자, 한글 24자 이내로 입력해 주세요."
UNAUTHORIZED_MESSAGE = "인증이 필요합니다."

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        raise ApiError(400, PASSWORD_TOO_LONG_MESSAGE)
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    raw = password.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        return False  # 이런 비밀번호로는 가입할 수 없으므로 항상 불일치
    try:
        return bcrypt.checkpw(raw, hashed.encode("ascii"))
    except ValueError:
        return False


def create_access_token(email: str, role: str, settings: Settings) -> str:
    """Spring(jjwt)이 만드는 토큰과 같은 모양: sub=이메일, role, iat, exp."""
    now = datetime.now(UTC)
    claims = {
        "sub": email,
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=settings.jwt_access_token_validity_seconds),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: SettingsDep,
    db: DbSession,
) -> User:
    """Authorization: Bearer <토큰> 을 검증하고 DB 에서 사용자를 불러옵니다. 실패하면 401."""
    if credentials is None:
        raise ApiError(401, UNAUTHORIZED_MESSAGE)
    try:
        # 만료(exp)와 사용자(sub)가 없는 토큰은 받지 않습니다.
        claims = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as e:
        raise ApiError(401, UNAUTHORIZED_MESSAGE) from e
    user = find_by_email(db, str(claims["sub"]))
    if user is None:
        # 토큰은 유효하지만 사용자가 삭제된 경우
        raise ApiError(401, UNAUTHORIZED_MESSAGE)
    return user


# 로그인이 필요한 엔드포인트: def handler(user: CurrentUser)
CurrentUser = Annotated[User, Depends(get_current_user)]
