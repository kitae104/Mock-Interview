from fastapi import APIRouter, status

from app.auth import service
from app.auth.schemas import LoginRequest, SignupRequest, TokenResponse
from app.core.config import SettingsDep
from app.core.db import DbSession
from app.users.schemas import UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(request: SignupRequest, db: DbSession) -> UserResponse:
    return service.signup(db, request)


@router.post("/login")
def login(request: LoginRequest, db: DbSession, settings: SettingsDep) -> TokenResponse:
    return service.login(db, request, settings)
