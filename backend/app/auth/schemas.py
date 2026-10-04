from typing import Annotated, Literal

from app.common.schemas import ApiModel, RequestModel
from app.common.validators import email, not_blank, size
from app.users.schemas import UserResponse

Email = Annotated[str, not_blank("이메일을 입력해 주세요."), email("올바른 이메일 형식이 아닙니다.")]


class SignupRequest(RequestModel):
    email: Email
    password: Annotated[
        str,
        not_blank("비밀번호를 입력해 주세요."),
        size("비밀번호는 8~64자여야 합니다.", min_length=8, max_length=64),
    ]
    name: Annotated[str, not_blank("이름을 입력해 주세요."), size("이름은 50자 이하여야 합니다.", max_length=50)]


class LoginRequest(RequestModel):
    email: Email
    password: Annotated[str, not_blank("비밀번호를 입력해 주세요.")]


class TokenResponse(ApiModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
    user: UserResponse
