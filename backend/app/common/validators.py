"""Spring Bean Validation(@NotBlank, @Size, @Email)과 같은 한국어 메시지를 붙이는 검증기.

사용 예: email: Annotated[str, not_blank("이메일을 입력해 주세요."), email("올바른 이메일 형식이 아닙니다.")]
여러 개를 붙이면 앞에서부터 검사하고 처음 실패한 메시지 하나만 응답에 들어갑니다.
"""

from collections.abc import Callable

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator


def not_blank(message: str) -> AfterValidator:
    def check(value: str) -> str:
        if not value.strip():
            raise ValueError(message)
        return value

    return AfterValidator(check)


def size(message: str, *, min_length: int = 0, max_length: int | None = None) -> AfterValidator:
    def check(value: str) -> str:
        if len(value) < min_length or (max_length is not None and len(value) > max_length):
            raise ValueError(message)
        return value

    return AfterValidator(check)


def email(message: str) -> AfterValidator:
    def check(value: str) -> str:
        if not value:
            return value  # 빈 값은 not_blank 가 맡습니다 (Spring @Email 과 같음).
        try:
            validate_email(value.strip(), check_deliverability=False)
        except EmailNotValidError as e:
            raise ValueError(message) from e
        return value

    return AfterValidator(check)


def check(predicate: Callable[[str], bool], message: str) -> AfterValidator:
    """그 밖의 규칙: check(lambda v: v.isalnum(), "영문과 숫자만 입력해 주세요.")"""

    def run(value: str) -> str:
        if not predicate(value):
            raise ValueError(message)
        return value

    return AfterValidator(run)
