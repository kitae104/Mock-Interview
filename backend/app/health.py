from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict[str, str]:
    """로그인 없이 호출 가능. Docker 헬스체크가 사용합니다."""
    return {"status": "UP"}
