from fastapi import APIRouter, Response

from app.ai import service
from app.ai.config import AiSettingsDep
from app.ai.providers import ChatModelDep
from app.ai.schemas import ChatRequest, ChatResponse
from app.core.security import CurrentUser

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat")
def chat(body: ChatRequest, user: CurrentUser, model: ChatModelDep, settings: AiSettingsDep) -> ChatResponse:
    """사용자별 최근 대화를 맥락으로 모델에 묻습니다 (Spring AI 확장 모듈과 같은 계약)."""
    return ChatResponse(reply=service.chat(user.email, body.message.strip(), model, settings))


@router.delete("/chat", status_code=204)
def reset(user: CurrentUser) -> Response:
    service.reset(user.email)
    return Response(status_code=204)
