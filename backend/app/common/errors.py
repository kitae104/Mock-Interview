import logging
from datetime import UTC, datetime
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

VALIDATION_MESSAGE = "입력값을 확인해 주세요."
NOT_READABLE_MESSAGE = "요청 본문을 읽을 수 없습니다. JSON 형식을 확인해 주세요."
BAD_PARAMETER_MESSAGE = "요청 값의 형식이 올바르지 않습니다."
SERVER_ERROR_MESSAGE = "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."


class ApiError(Exception):
    """사용자에게 보여줄 한국어 메시지와 상태 코드를 가진 예외. 예: raise ApiError(404, "게시글을 찾을 수 없습니다.")"""

    def __init__(self, status: int, message: str, errors: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        # 필드별 메시지 (예: {"questionCount": "질문 수는 3~10개여야 합니다."}). 검증을 서비스에서 할 때 씁니다.
        self.errors = errors


def error_body(status: int, message: str, errors: dict[str, str] | None = None) -> dict[str, Any]:
    """Spring 백엔드의 ErrorResponse 와 같은 형식 { status, message, errors, timestamp }."""
    return {
        "status": status,
        "message": message,
        "errors": errors or {},
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }


def error_response(status: int, message: str, errors: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(error_body(status, message, errors), status_code=status)


def default_message(status: int) -> str:
    return {
        400: "요청 값을 확인해 주세요.",
        401: "인증이 필요합니다.",
        403: "권한이 없습니다.",
        404: "요청한 경로를 찾을 수 없습니다.",
        405: "지원하지 않는 요청 방식입니다.",
        406: "지원하지 않는 응답 형식입니다.",
        413: "요청 크기가 너무 큽니다.",
        415: "지원하지 않는 Content-Type 입니다.",
    }.get(status, SERVER_ERROR_MESSAGE if status >= 500 else "요청을 처리하지 못했습니다.")


def field_message(err: dict[str, Any]) -> str:
    """pydantic 검증 오류 하나를 한국어 메시지로 바꿉니다. 스키마에서 ValueError 로 던진 메시지는 그대로 씁니다."""
    kind = err.get("type", "")
    ctx = err.get("ctx") or {}
    if kind == "value_error":
        return str(err.get("msg", "")).removeprefix("Value error, ")
    messages = {
        "missing": "필수 입력값입니다.",
        "string_type": "문자열을 입력해 주세요.",
        "string_too_short": "{min_length}자 이상이어야 합니다.",
        "string_too_long": "{max_length}자 이하여야 합니다.",
        "string_pattern_mismatch": "형식이 올바르지 않습니다.",
        "too_short": "{min_length}개 이상이어야 합니다.",
        "too_long": "{max_length}개 이하여야 합니다.",
        "int_type": "정수를 입력해 주세요.",
        "int_parsing": "정수를 입력해 주세요.",
        "int_from_float": "정수를 입력해 주세요.",
        "float_type": "숫자를 입력해 주세요.",
        "float_parsing": "숫자를 입력해 주세요.",
        "decimal_parsing": "숫자를 입력해 주세요.",
        "bool_type": "true 또는 false 여야 합니다.",
        "bool_parsing": "true 또는 false 여야 합니다.",
        "greater_than": "{gt}보다 커야 합니다.",
        "greater_than_equal": "{ge} 이상이어야 합니다.",
        "less_than": "{lt}보다 작아야 합니다.",
        "less_than_equal": "{le} 이하여야 합니다.",
        "enum": "다음 중 하나여야 합니다: {expected}",
        "literal_error": "다음 중 하나여야 합니다: {expected}",
        "date_parsing": "날짜 형식이 올바르지 않습니다.",
        "date_from_datetime_parsing": "날짜 형식이 올바르지 않습니다.",
        "datetime_parsing": "날짜·시간 형식이 올바르지 않습니다.",
        "datetime_from_date_parsing": "날짜·시간 형식이 올바르지 않습니다.",
        "uuid_parsing": "UUID 형식이 올바르지 않습니다.",
        "list_type": "배열을 입력해 주세요.",
        "dict_type": "객체를 입력해 주세요.",
        "model_attributes_type": "객체를 입력해 주세요.",
        "extra_forbidden": "허용되지 않는 필드입니다.",
    }
    template = messages.get(kind)
    if template is None:
        return "올바른 값이 아닙니다."
    try:
        return template.format(**ctx)
    except (KeyError, IndexError):
        return template.split("{")[0].strip() or "올바른 값이 아닙니다."


def field_name(loc: tuple[Any, ...]) -> str:
    # ("body", "items", 0, "name") → "items[0].name" (Spring 의 필드 경로와 같은 모양)
    name = ""
    for part in loc[1:]:
        if isinstance(part, int):
            name += f"[{part}]"
        else:
            name += f".{part}" if name else str(part)
    return name or str(loc[0])


def register_error_handlers(app: FastAPI) -> None:
    """모든 API 에러를 { status, message, errors, timestamp } 형식으로 응답합니다."""

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status, exc.message, exc.errors)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # 404·405 처럼 Starlette 가 기본 문구(영어)로 던진 것은 한국어 기본 메시지로 바꿉니다.
        detail = exc.detail if isinstance(exc.detail, str) else None
        is_default = detail is None or detail == HTTPStatus(exc.status_code).phrase
        message = default_message(exc.status_code) if is_default or exc.status_code >= 500 else detail
        return JSONResponse(error_body(exc.status_code, message), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errs = exc.errors()
        # 본문이 JSON 이 아니거나, 비었거나, 객체가 아니면 필드 검증 전에 실패한 것
        if any(e.get("type") == "json_invalid" or tuple(e.get("loc", ())) == ("body",) for e in errs):
            return error_response(400, NOT_READABLE_MESSAGE)
        errors: dict[str, str] = {}
        for err in errs:
            errors.setdefault(field_name(tuple(err.get("loc", ("body",)))), field_message(err))
        only_params = all(err.get("loc", ("body",))[0] in ("query", "path", "header", "cookie") for err in errs)
        return error_response(400, BAD_PARAMETER_MESSAGE if only_params else VALIDATION_MESSAGE, errors)

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        log.warning("데이터 무결성 위반: %s", exc.orig)
        return error_response(409, "이미 존재하거나 다른 데이터와 충돌합니다.")

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        # 원인은 로그에만 남기고 응답에는 내부 정보를 넣지 않습니다.
        log.error("처리하지 못한 예외: %s %s", request.method, request.url.path, exc_info=exc)
        return error_response(500, default_message(500))
