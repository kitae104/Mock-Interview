import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import health
from app.auth import router as auth
from app.common.errors import register_error_handlers
from app.core.config import get_settings
from app.users import router as users

# 확장 모듈 라우터 import. 위 블록과 따로 정렬되도록 isort: split 으로 나눕니다.
# isort: split
from app.ai import router as ai

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")

app = FastAPI(
    title="Backend API",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
register_error_handlers(app)

# 라우터마다 전체 경로(/api/...)를 prefix 로 가집니다 (Spring 백엔드와 같은 경로).
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(ai.router)
