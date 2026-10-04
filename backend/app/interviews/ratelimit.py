import threading
import time
from collections import defaultdict, deque

from app.common.errors import ApiError


class SlidingWindowLimiter:
    """사용자별 호출 횟수 제한 (슬라이딩 윈도우). 프로세스 메모리에 두므로 백엔드를 여러 개 띄우면
    인스턴스마다 따로 셉니다.
    인스턴스를 늘릴 때는 DB 나 Redis 기반으로 바꾸세요 (docs/PLAN.md 7.6)."""

    def __init__(self, window_seconds: float = 60.0) -> None:
        self.window = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[int, deque[float]] = defaultdict(deque)

    def hit(self, key: int, limit: int) -> bool:
        """호출 한 번을 기록하고 한도 안이면 True. 한도를 넘으면 기록하지 않고 False."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


ai_limiter = SlidingWindowLimiter()


def enforce_ai_rate(user_id: int, limit: int) -> None:
    """AI·음성 인식 비용이 드는 요청 앞에서 부릅니다. 초과하면 429."""
    if not ai_limiter.hit(user_id, limit):
        raise ApiError(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
