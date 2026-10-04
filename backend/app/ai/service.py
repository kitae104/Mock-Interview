import logging
import threading
from collections import defaultdict, deque

from app.ai.config import AiSettings
from app.ai.providers import ChatModel, Message, ModelError
from app.common.errors import ApiError

log = logging.getLogger(__name__)


class ChatMemory:
    """사용자별 최근 대화. 프로세스 메모리에 두므로 서버를 다시 시작하면 지워집니다.
    오래 보관하거나 여러 인스턴스로 띄우려면 DB 테이블로 바꾸세요."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._messages: dict[str, deque[Message]] = defaultdict(deque)

    def get(self, key: str) -> list[Message]:
        with self._lock:
            return list(self._messages[key])

    def add(self, key: str, messages: list[Message], limit: int) -> None:
        with self._lock:
            history = self._messages[key]
            history.extend(messages)
            while len(history) > limit:
                history.popleft()

    def clear(self, key: str) -> None:
        with self._lock:
            self._messages.pop(key, None)


memory = ChatMemory()


def chat(user_key: str, message: str, model: ChatModel, settings: AiSettings) -> str:
    user_message: Message = {"role": "user", "content": message}
    try:
        reply = model.complete(settings.ai_system_prompt, [*memory.get(user_key), user_message])
    except ModelError as e:
        log.warning("AI 모델 호출 실패: %s", e)
        raise ApiError(502, "AI 응답을 받지 못했습니다. 모델 설정(API 키, 모델 이름)을 확인해 주세요.") from e
    memory.add(user_key, [user_message, {"role": "assistant", "content": reply}], settings.ai_history_size)
    return reply


def reset(user_key: str) -> None:
    memory.clear(user_key)
