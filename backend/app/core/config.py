from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경 변수 설정. 필드 이름의 대문자가 환경 변수 이름입니다 (database_url → DATABASE_URL)."""

    # 로컬 개발(make backend-dev)에서는 프로젝트 루트의 .env(DB_PORT, JWT_SECRET 등)도 읽습니다.
    # 컨테이너는 docker-compose.yml 의 환경 변수로 받습니다.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    # DATABASE_URL 을 주면 그대로 쓰고, 없으면 아래 DB_* 값으로 PostgreSQL 주소를 만듭니다 (루트 .env 와 같은 이름).
    database_url: str = ""
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "mock_interview"
    db_username: str = "mock_interview"
    db_password: str = "mock_interview"
    # 운영 환경에서는 반드시 JWT_SECRET 환경 변수로 32바이트 이상의 임의 문자열을 지정하세요.
    jwt_secret: str = "local-dev-secret-change-me-please-32bytes-or-more"
    jwt_access_token_validity_seconds: int = 3600
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @field_validator("jwt_secret")
    @classmethod
    def secret_must_be_long_enough(cls, value: str) -> str:
        # HS256 키는 32바이트 이상이어야 합니다 (Spring 백엔드와 같은 기준).
        if len(value.encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET 은 최소 32바이트 이상이어야 합니다.")
        return value

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        if not self.database_url:
            self.database_url = f"postgresql+psycopg://{self.db_username}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# 라우터·의존성에서 설정을 받을 때: def handler(settings: SettingsDep)
SettingsDep = Annotated[Settings, Depends(get_settings)]
