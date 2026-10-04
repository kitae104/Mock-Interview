from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """요청·응답 스키마의 기반. JSON 은 camelCase(createdAt), 파이썬 코드는 snake_case(created_at)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class RequestModel(ApiModel):
    """요청 본문 스키마의 기반. 빠졌거나 null 인 문자열 필드를 "" 로 바꿔, Spring @NotBlank 처럼
    "필수 입력값입니다." 대신 필드에 붙인 not_blank 메시지가 나오게 합니다."""

    @model_validator(mode="before")
    @classmethod
    def missing_strings_as_blank(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        for name, field in cls.model_fields.items():
            if field.annotation is not str or not field.is_required():
                continue
            key = field.alias or name
            if data.get(key) is None and data.get(name) is None:
                data[key] = ""
        return data
