from typing import Annotated

from app.common.schemas import ApiModel, RequestModel
from app.common.validators import not_blank, size


class ChatRequest(RequestModel):
    message: Annotated[
        str,
        not_blank("메시지를 입력해 주세요."),
        size("메시지는 4000자 이하로 입력해 주세요.", max_length=4000),
    ]


class ChatResponse(ApiModel):
    reply: str
